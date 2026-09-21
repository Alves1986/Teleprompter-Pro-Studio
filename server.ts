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
  const PORT = 3000;

  app.use(express.json());

  // Real-Time Remote Control WebSocket Server
  const wss = new WebSocketServer({ server, path: '/ws-remote' });
  const rooms = new Map<string, RoomClient[]>();

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

    ws.on('message', (raw) => {
      try {
        const data = JSON.parse(raw.toString());
        if (data.type === 'join') {
          currentRoom = (data.room || 'DEFAULT').trim().toUpperCase();
          currentRole = data.role === 'host' ? 'host' : 'controller';

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

          const controllersCount = list.filter(c => c.role === 'controller').length;
          broadcastToRoom(currentRoom, {
            type: 'room_status',
            controllersCount,
            hasHost: list.some(c => c.role === 'host'),
            room: currentRoom
          });
        } else if (data.type === 'sync_state') {
          if (currentRoom) {
            forwardToRole(currentRoom, 'controller', data);
          }
        } else if (data.type === 'command') {
          if (currentRoom) {
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
        if (list.length === 0) {
          rooms.delete(currentRoom);
        } else {
          rooms.set(currentRoom, list);
          const controllersCount = list.filter(c => c.role === 'controller').length;
          broadcastToRoom(currentRoom, {
            type: 'room_status',
            controllersCount,
            hasHost: list.some(c => c.role === 'host'),
            room: currentRoom
          });
        }
      }
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
    const vite = await createViteServer({
      server: { middlewareMode: true },
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
