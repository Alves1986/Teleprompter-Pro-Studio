import express from 'express';
import http from 'http';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';

let aiClient: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({ apiKey: key });
  }
  return aiClient;
}

interface RoomClient {
  ws: WebSocket;
  role: 'host' | 'controller';
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const PORT = Number(process.env.PORT) || 3000;

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`Port ${PORT} in use, retrying in 1s...`);
      setTimeout(() => {
        try {
          server.close();
        } catch (_) {}
        server.listen(PORT, '0.0.0.0');
      }, 1000);
    } else {
      console.error('Server error:', err);
    }
  });

  const cleanShutdown = () => {
    try {
      wss.close();
      server.close(() => {
        process.exit(0);
      });
    } catch (_) {
      process.exit(0);
    }
  };

  process.on('SIGTERM', cleanShutdown);
  process.on('SIGINT', cleanShutdown);

  app.use(express.json());

  // Real-Time Remote Control WebSocket Server & REST Fallback
  const wss = new WebSocketServer({ noServer: true });
  const rooms = new Map<string, RoomClient[]>();
  const roomStates = new Map<string, any>();
  const roomCommands = new Map<string, { id: number; cmdId?: string; action: string; payload: any; timestamp: number }[]>();
  let commandCounter = 1;

  interface ActiveSession {
    clientId: string;
    role: 'host' | 'controller';
    lastSeen: number;
  }
  const roomSessions = new Map<string, Map<string, ActiveSession>>();
  const recentlyForwardedCmds = new Set<string>();

  // Handle HTTP Upgrade explicitly so Vite or proxy doesn't drop it
  server.on('upgrade', (request, socket, head) => {
    try {
      const url = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`);
      if (url.pathname === '/ws-remote') {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit('connection', ws, request);
        });
      }
    } catch (e) {
      console.error('WS upgrade error:', e);
    }
  });

  const updateSession = (room: string, clientId: string, role: 'host' | 'controller') => {
    if (!room || !clientId) return;
    if (!roomSessions.has(room)) {
      roomSessions.set(room, new Map());
    }
    roomSessions.get(room)!.set(clientId, { clientId, role, lastSeen: Date.now() });
  };

  const cleanSessions = (room: string) => {
    const sessions = roomSessions.get(room);
    if (!sessions) return;
    const now = Date.now();
    for (const [id, s] of sessions.entries()) {
      if (now - s.lastSeen > 12000) {
        sessions.delete(id);
      }
    }
  };

  const getRoomControllersCount = (roomCode: string) => {
    cleanSessions(roomCode);
    const sessions = roomSessions.get(roomCode);
    const sessionControllers = sessions 
      ? Array.from(sessions.values()).filter(s => s.role === 'controller').length 
      : 0;
    const wsControllers = (rooms.get(roomCode) || [])
      .filter(c => c.role === 'controller' && c.ws.readyState === WebSocket.OPEN).length;
    return Math.max(wsControllers, sessionControllers);
  };

  const getRoomHasHost = (roomCode: string) => {
    cleanSessions(roomCode);
    const sessions = roomSessions.get(roomCode);
    const sessionHost = sessions 
      ? Array.from(sessions.values()).some(s => s.role === 'host') 
      : false;
    const wsHost = (rooms.get(roomCode) || [])
      .some(c => c.role === 'host' && c.ws.readyState === WebSocket.OPEN);
    return wsHost || sessionHost;
  };

  const broadcastToRoom = (roomCode: string, payload: any) => {
    const clients = rooms.get(roomCode);
    if (!clients) return;
    const msg = JSON.stringify(payload);
    for (const client of clients) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(msg);
      }
    }
  };

  const forwardToRole = (roomCode: string, targetRole: 'host' | 'controller', payload: any) => {
    const clients = rooms.get(roomCode);
    if (!clients) return;
    const msg = JSON.stringify(payload);
    for (const client of clients) {
      if (client.role === targetRole && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(msg);
      }
    }
  };

  wss.on('connection', (ws) => {
    let currentRoom = '';
    let currentRole: 'host' | 'controller' = 'controller';
    let currentClientId = '';

    ws.on('message', (raw) => {
      try {
        const data = JSON.parse(raw.toString());

        // Heartbeat ping-pong
        if (data.type === 'ping') {
          if (data.clientId && currentRoom) {
            updateSession(currentRoom, data.clientId, currentRole);
          }
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'pong' }));
          }
          return;
        }

        if (data.type === 'join') {
          currentRoom = (data.room || 'STUDIO1').trim().toUpperCase();
          currentRole = data.role === 'host' ? 'host' : 'controller';
          currentClientId = data.clientId || `ws_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

          updateSession(currentRoom, currentClientId, currentRole);

          if (!rooms.has(currentRoom)) {
            rooms.set(currentRoom, []);
          }
          const list = rooms.get(currentRoom)!;
          // If host reconnects, replace old host entry if exists
          if (currentRole === 'host') {
            const hostIndex = list.findIndex(c => c.role === 'host');
            if (hostIndex >= 0) {
              list.splice(hostIndex, 1);
            }
          }
          list.push({ ws, role: currentRole });

          const controllersCount = getRoomControllersCount(currentRoom);
          const hasHost = getRoomHasHost(currentRoom);

          // 1. Notify all participants of room status
          broadcastToRoom(currentRoom, {
            type: 'room_status',
            controllersCount,
            hasHost,
            room: currentRoom
          });

          // 2. Push state to controller or trigger state broadcast from host
          if (currentRole === 'controller') {
            if (roomStates.has(currentRoom) && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify(roomStates.get(currentRoom)));
            }
            if (hasHost) {
              forwardToRole(currentRoom, 'host', { type: 'request_sync' });
            }
          } else if (currentRole === 'host') {
            // If host just joined and we have cached state, tell controllers
            if (roomStates.has(currentRoom)) {
              forwardToRole(currentRoom, 'controller', roomStates.get(currentRoom));
            }
          }
        } else if (data.type === 'sync_state') {
          if (currentRoom) {
            if (currentClientId) updateSession(currentRoom, currentClientId, 'host');
            roomStates.set(currentRoom, data);
            forwardToRole(currentRoom, 'controller', data);
          }
        } else if (data.type === 'command') {
          if (currentRoom) {
            if (currentClientId) updateSession(currentRoom, currentClientId, 'controller');
            const cmdId = data.cmdId || `cmd_${Date.now()}_${commandCounter}`;
            
            const cmdObj = {
              id: commandCounter++,
              cmdId,
              action: data.action,
              payload: data.payload !== undefined ? data.payload : data,
              timestamp: Date.now()
            };

            if (!roomCommands.has(currentRoom)) {
              roomCommands.set(currentRoom, []);
            }
            const q = roomCommands.get(currentRoom)!;
            q.push(cmdObj);
            if (q.length > 30) q.shift();

            // Track recent command ID to avoid duplicate forwarding
            recentlyForwardedCmds.add(cmdId);
            setTimeout(() => recentlyForwardedCmds.delete(cmdId), 6000);

            forwardToRole(currentRoom, 'host', data);
          }
        }
      } catch (err) {
        console.error('WS parse error:', err);
      }
    });

    ws.on('close', () => {
      if (currentRoom && rooms.has(currentRoom)) {
        const list = rooms.get(currentRoom)!.filter(c => c.ws !== ws);
        rooms.set(currentRoom, list);

        if (currentClientId && roomSessions.has(currentRoom)) {
          roomSessions.get(currentRoom)!.delete(currentClientId);
        }

        const controllersCount = getRoomControllersCount(currentRoom);
        const hasHost = getRoomHasHost(currentRoom);

        broadcastToRoom(currentRoom, {
          type: 'room_status',
          controllersCount,
          hasHost,
          room: currentRoom
        });
      }
    });
  });

  // REST API: Remote Control Fallback Endpoints
  app.post('/api/remote/join', (req, res) => {
    const room = (req.body?.room || 'STUDIO1').trim().toUpperCase();
    const role = req.body?.role === 'host' ? 'host' : 'controller';
    const clientId = req.body?.clientId || `http_${Date.now()}`;

    updateSession(room, clientId, role);

    const state = roomStates.get(room) || null;
    const controllersCount = getRoomControllersCount(room);
    const hasHost = getRoomHasHost(room);

    res.json({
      ok: true,
      room,
      role,
      hasHost,
      controllersCount,
      state
    });
  });

  app.post('/api/remote/sync', (req, res) => {
    const room = (req.body?.room || 'STUDIO1').trim().toUpperCase();
    const clientId = req.body?.clientId;
    const state = req.body?.state;

    if (clientId) updateSession(room, clientId, 'host');

    if (room && state) {
      roomStates.set(room, state);
      forwardToRole(room, 'controller', state);
    }
    res.json({ ok: true });
  });

  app.post('/api/remote/command', (req, res) => {
    const room = (req.body?.room || 'STUDIO1').trim().toUpperCase();
    const action = req.body?.action;
    const payload = req.body?.payload;
    const cmdId = req.body?.cmdId || `cmd_${Date.now()}_${commandCounter}`;
    const clientId = req.body?.clientId;
    const alreadySentViaWs = Boolean(req.body?.alreadySentViaWs);

    if (clientId) updateSession(room, clientId, 'controller');

    if (!room || !action) {
      return res.status(400).json({ error: 'room and action are required' });
    }

    const cmdObj = {
      id: commandCounter++,
      cmdId,
      action,
      payload,
      timestamp: Date.now()
    };

    if (!roomCommands.has(room)) {
      roomCommands.set(room, []);
    }
    const q = roomCommands.get(room)!;
    q.push(cmdObj);
    if (q.length > 30) q.shift();

    // Only forward to host WebSocket if this command wasn't already sent via WebSocket
    if (!alreadySentViaWs && !recentlyForwardedCmds.has(cmdId)) {
      recentlyForwardedCmds.add(cmdId);
      setTimeout(() => recentlyForwardedCmds.delete(cmdId), 6000);

      forwardToRole(room, 'host', {
        type: 'command',
        cmdId,
        action,
        payload,
        ...payload
      });
    }

    res.json({ ok: true, id: cmdObj.id });
  });

  app.get('/api/remote/poll', (req, res) => {
    const room = String(req.query.room || 'STUDIO1').trim().toUpperCase();
    const role = req.query.role === 'host' ? 'host' : 'controller';
    const clientId = String(req.query.clientId || '');
    const since = Number(req.query.since || 0);

    if (clientId) updateSession(room, clientId, role);

    const state = roomStates.get(room) || null;
    const controllersCount = getRoomControllersCount(room);
    const hasHost = getRoomHasHost(room);

    let commands: any[] = [];
    if (role === 'host' && roomCommands.has(room)) {
      commands = roomCommands.get(room)!.filter(c => c.id > since);
    }

    res.json({
      room,
      hasHost,
      controllersCount,
      state,
      commands
    });
  });


  // API Health Check
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Server-side Gemini API Route
  app.post('/api/ai', async (req, res) => {
    try {
      const { type, content, promptText } = req.body;
      const ai = getGenAI();
      let prompt = '';

      if (type === 'improve') {
        prompt = `Aja como um redator profissional de TV. Melhore o texto deste roteiro de teleprompter para garantir uma fluidez perfeita de fala, corrigindo erros e melhorando o ritmo.
Importante: Conserve quaisquer marcadores especiais presentes, como [PAUSA], [CUE: ...], [NOTA: ...], [ÊNFASE: ...].
Roteiro original:
${content || ''}`;
      } else if (type === 'summarize') {
        prompt = `Resuma este roteiro de teleprompter para deixá-lo mais dinâmico e rápido de ler.
Corte redundâncias, mas mantenha o sentido original e marcadores como [PAUSA].
Roteiro original:
${content || ''}`;
      } else if (type === 'generate') {
        prompt = `Crie um roteiro rápido para teleprompter sobre o seguinte tópico: "${promptText || ''}".
Inclua, de forma inteligente, alguns marcadores de formatação como [PAUSA] para indicar respiros, [ÊNFASE: palavra] para destaques, e [CUE: câmera/ação] se necessário.
Retorne apenas o texto do roteiro pronto.`;
      } else {
        return res.status(400).json({ error: 'Tipo de ação inválido' });
      }

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
      });

      return res.json({ text: response.text || '' });
    } catch (err: any) {
      console.error('API /api/ai error:', err);
      const isMissingKey = err?.message?.includes('GEMINI_API_KEY');
      return res.status(isMissingKey ? 503 : 500).json({
        error: isMissingKey ? 'GEMINI_API_KEY não configurada no servidor.' : (err?.message || 'Erro ao processar com a IA')
      });
    }
  });

  // Vite middleware for development or static serving for production
  if (process.env.NODE_ENV !== 'production') {
    const isHmrDisabled = process.env.DISABLE_HMR === 'true';
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: isHmrDisabled ? false : { server },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Teleprompter server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
