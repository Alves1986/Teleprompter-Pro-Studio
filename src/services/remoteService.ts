export interface RemoteSyncState {
  isPlaying: boolean;
  speed: number;
  fontSize: number;
  progressPercent: number;
  scriptTitle: string;
  wordCount?: number;
  cuePoints?: string[];
  activeCue?: string;
  inEditor?: boolean;
  estimatedRemaining?: number;
}

export interface RemoteCommand {
  cmdId?: string;
  id?: number | string;
  action: string;
  payload?: any;
  timestamp?: number;
}

export type ConnectionMode = 'websocket' | 'broadcast' | 'polling' | 'disconnected';

export interface RemoteStatus {
  isConnected: boolean;
  mode: ConnectionMode;
  controllersCount: number;
  hasHost: boolean;
  room: string;
}

type StateCallback = (state: Partial<RemoteSyncState>) => void;
type CommandCallback = (action: string, payload?: any) => void;
type StatusCallback = (status: RemoteStatus) => void;

/**
 * Extracts and cleans a room code from a scanned string or URL.
 * Handles:
 * - Full URLs with ?remote=XYZ or &remote=XYZ
 * - URLs with #remote=XYZ
 * - Raw codes like "STUDIO-1234" or "studio1"
 */
export function extractRoomCode(raw: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();

  try {
    // Check if it's a valid URL
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.includes('?')) {
      const url = new URL(trimmed.startsWith('http') ? trimmed : `https://dummy.com/${trimmed}`);
      const paramCode = url.searchParams.get('remote') || url.searchParams.get('room') || url.searchParams.get('code');
      if (paramCode) {
        return paramCode.trim().toUpperCase();
      }

      // Check hash fragment (e.g. #remote=STUDIO-1)
      if (url.hash) {
        const hashParams = new URLSearchParams(url.hash.replace(/^#/, ''));
        const hashRem = hashParams.get('remote') || hashParams.get('room');
        if (hashRem) return hashRem.trim().toUpperCase();
      }
    }
  } catch {}

  // Check key=value pattern if plain string
  const match = trimmed.match(/remote=([a-zA-Z0-9_-]+)/i);
  if (match && match[1]) {
    return match[1].trim().toUpperCase();
  }

  // Otherwise return alphanumeric + hyphen sanitized string (max 24 chars)
  const sanitized = trimmed.replace(/[^a-zA-Z0-9_-]/g, '').toUpperCase().slice(0, 24);
  return sanitized;
}

export class RemoteClient {
  public readonly clientId: string;
  private room: string;
  private role: 'host' | 'controller';
  private ws: WebSocket | null = null;
  private broadcastChannel: BroadcastChannel | null = null;
  private pollInterval: any = null;
  private reconnectTimeout: any = null;
  private heartbeatInterval: any = null;
  private lastCommandId = 0;
  private isDestroyed = false;

  // Deduplication set to avoid processing the exact same command twice (e.g. via WS and HTTP fallback)
  private processedCmdIds = new Set<string>();

  private onStateCb?: StateCallback;
  private onCommandCb?: CommandCallback;
  private onStatusCb?: StatusCallback;

  private currentStatus: RemoteStatus = {
    isConnected: false,
    mode: 'disconnected',
    controllersCount: 0,
    hasHost: false,
    room: ''
  };

  constructor(
    room: string, 
    role: 'host' | 'controller',
    callbacks: {
      onState?: StateCallback;
      onCommand?: CommandCallback;
      onStatus?: StatusCallback;
    }
  ) {
    this.clientId = `client_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    this.room = (room || 'STUDIO1').trim().toUpperCase();
    this.role = role;
    this.onStateCb = callbacks.onState;
    this.onCommandCb = callbacks.onCommand;
    this.onStatusCb = callbacks.onStatus;

    this.currentStatus.room = this.room;
    this.init();
  }

  private updateStatus(patch: Partial<RemoteStatus>) {
    this.currentStatus = { ...this.currentStatus, ...patch };
    this.onStatusCb?.(this.currentStatus);
  }

  private init() {
    this.initBroadcastChannel();
    this.initStorageListener();
    this.connectWebSocket();
    this.startHttpPolling();
  }

  /**
   * BroadcastChannel for instant 0ms cross-tab sync in the same browser
   */
  private initBroadcastChannel() {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.broadcastChannel = new BroadcastChannel(`tp_bus_${this.room}`);
        this.broadcastChannel.onmessage = (event) => {
          const data = event.data;
          if (!data || typeof data !== 'object') return;

          if (data.type === 'sync_state' && this.role === 'controller') {
            this.updateStatus({ isConnected: true, hasHost: true });
            this.onStateCb?.(data);
          } else if (data.type === 'command' && this.role === 'host') {
            const cmdId = data.cmdId || `${data.action}_${data.timestamp}`;
            if (this.shouldProcessCommand(cmdId)) {
              this.updateStatus({ isConnected: true, controllersCount: Math.max(1, this.currentStatus.controllersCount) });
              const action = data.action;
              const payload = data.payload !== undefined ? data.payload : data;
              this.onCommandCb?.(action, payload);
            }
          } else if (data.type === 'join') {
            if (data.role === 'controller' && this.role === 'host') {
              this.updateStatus({ controllersCount: Math.max(1, this.currentStatus.controllersCount + 1) });
            }
          }
        };

        this.broadcastChannel.postMessage({
          type: 'join',
          room: this.room,
          role: this.role,
          clientId: this.clientId
        });
      } catch (e) {
        console.warn('BroadcastChannel error:', e);
      }
    }
  }

  /**
   * Deduplicates commands arriving via multiple transports
   */
  private shouldProcessCommand(cmdId: string): boolean {
    if (!cmdId) return true;
    if (this.processedCmdIds.has(cmdId)) {
      return false;
    }
    this.processedCmdIds.add(cmdId);
    // Auto-prune old command IDs after 8 seconds
    setTimeout(() => {
      this.processedCmdIds.delete(cmdId);
    }, 8000);
    return true;
  }

  /**
   * LocalStorage event listener as secondary local fallback
   */
  private initStorageListener() {
    if (typeof window === 'undefined') return;

    window.addEventListener('storage', (e) => {
      if (this.isDestroyed) return;
      if (e.key === `tp_cmd_${this.room}` && this.role === 'host' && e.newValue) {
        try {
          const cmd = JSON.parse(e.newValue);
          const cmdId = cmd.cmdId || `${cmd.action}_${cmd.timestamp}`;
          if (this.shouldProcessCommand(cmdId)) {
            const payload = cmd.payload !== undefined ? cmd.payload : cmd;
            this.onCommandCb?.(cmd.action, payload);
          }
        } catch {}
      } else if (e.key === `tp_state_${this.room}` && this.role === 'controller' && e.newValue) {
        try {
          const state = JSON.parse(e.newValue);
          this.onStateCb?.(state);
        } catch {}
      }
    });
  }

  /**
   * Primary WebSocket connection
   */
  private connectWebSocket() {
    if (this.isDestroyed) return;

    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws-remote`;

    try {
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        if (this.isDestroyed) return;
        this.updateStatus({ isConnected: true, mode: 'websocket' });

        this.sendWs({
          type: 'join',
          room: this.room,
          role: this.role,
          clientId: this.clientId
        });

        // 15s ping-pong heartbeat
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.sendWs({ type: 'ping', clientId: this.clientId });
          }
        }, 15000);
      };

      this.ws.onmessage = (event) => {
        if (this.isDestroyed) return;
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'pong') return;

          if (msg.type === 'room_status') {
            this.updateStatus({
              controllersCount: msg.controllersCount ?? this.currentStatus.controllersCount,
              hasHost: msg.hasHost ?? this.currentStatus.hasHost
            });
          } else if (msg.type === 'sync_state') {
            if (this.role === 'controller') {
              this.updateStatus({ isConnected: true, hasHost: true });
              this.onStateCb?.(msg);
            }
          } else if (msg.type === 'command') {
            if (this.role === 'host') {
              const cmdId = msg.cmdId || `${msg.action}_${msg.timestamp}`;
              if (this.shouldProcessCommand(cmdId)) {
                const action = msg.action;
                const payload = msg.payload !== undefined ? msg.payload : msg;
                this.onCommandCb?.(action, payload);
              }
            }
          } else if (msg.type === 'request_sync') {
            if (this.role === 'host') {
              this.onCommandCb?.('request_sync', {});
            }
          }
        } catch (err) {
          console.warn('Remote ws parse error:', err);
        }
      };

      this.ws.onclose = () => {
        if (this.isDestroyed) return;
        if (this.currentStatus.mode === 'websocket') {
          this.updateStatus({ mode: 'polling' });
        }
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        
        // Exponential/staggered reconnect
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = setTimeout(() => {
          this.connectWebSocket();
        }, 2500);
      };

      this.ws.onerror = () => {
        if (this.currentStatus.mode === 'websocket') {
          this.updateStatus({ mode: 'polling' });
        }
      };
    } catch (e) {
      console.warn('WebSocket init exception:', e);
      this.updateStatus({ mode: 'polling' });
    }
  }

  /**
   * HTTP REST fallback polling for 100% reliable continuous connection
   */
  private startHttpPolling() {
    this.httpRegisterJoin();

    if (this.pollInterval) clearInterval(this.pollInterval);
    this.pollInterval = setInterval(async () => {
      if (this.isDestroyed) return;
      await this.httpPoll();
    }, 1500);
  }

  private async httpRegisterJoin() {
    try {
      const res = await fetch('/api/remote/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room: this.room,
          role: this.role,
          clientId: this.clientId
        })
      });
      if (res.ok) {
        const data = await res.json();
        this.updateStatus({
          isConnected: true,
          mode: this.ws && this.ws.readyState === WebSocket.OPEN ? 'websocket' : 'polling',
          controllersCount: data.controllersCount ?? this.currentStatus.controllersCount,
          hasHost: data.hasHost ?? this.currentStatus.hasHost
        });
        if (data.state && this.role === 'controller') {
          this.onStateCb?.(data.state);
        }
      }
    } catch {}
  }

  private async httpPoll() {
    try {
      const url = `/api/remote/poll?room=${encodeURIComponent(this.room)}&role=${this.role}&clientId=${encodeURIComponent(this.clientId)}&since=${this.lastCommandId}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        this.updateStatus({
          isConnected: true,
          mode: this.ws && this.ws.readyState === WebSocket.OPEN ? 'websocket' : 'polling',
          controllersCount: data.controllersCount ?? this.currentStatus.controllersCount,
          hasHost: data.hasHost ?? this.currentStatus.hasHost
        });

        if (this.role === 'controller' && data.state) {
          this.onStateCb?.(data.state);
        }

        if (this.role === 'host' && Array.isArray(data.commands)) {
          for (const cmd of data.commands) {
            if (typeof cmd.id === 'number' && cmd.id > this.lastCommandId) {
              this.lastCommandId = cmd.id;
            }
            const cmdId = cmd.cmdId || `${cmd.action}_${cmd.timestamp || cmd.id}`;
            if (this.shouldProcessCommand(cmdId)) {
              const payload = cmd.payload !== undefined ? cmd.payload : cmd;
              this.onCommandCb?.(cmd.action, payload);
            }
          }
        }
      }
    } catch {}
  }

  private sendWs(data: any): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(data));
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  /**
   * Send a command (called by controller)
   * With unique cmdId to prevent double-execution across transports
   */
  public sendCommand(action: string, payload: any = {}) {
    const cmdId = `cmd_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const message = {
      type: 'command',
      cmdId,
      action,
      payload,
      clientId: this.clientId,
      room: this.room,
      ...payload,
      timestamp: Date.now()
    };

    // 1. Send via WebSocket if open
    const wsSent = this.sendWs(message);

    // 2. Broadcast via BroadcastChannel locally for other open tabs
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(message);
      } catch {}
    }

    // 3. Save to localStorage for cross-tab event fallback
    try {
      localStorage.setItem(`tp_cmd_${this.room}`, JSON.stringify(message));
    } catch {}

    // 4. Send via HTTP REST only if WebSocket is not open or as queue fallback
    // Always store on server for polling hosts, but mark wsSent so server doesn't duplicate
    fetch('/api/remote/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room: this.room,
        action,
        payload,
        cmdId,
        clientId: this.clientId,
        alreadySentViaWs: wsSent
      })
    }).catch(() => {});
  }

  /**
   * Broadcast state (called by host)
   */
  public syncState(state: Partial<RemoteSyncState>) {
    const message = {
      type: 'sync_state',
      clientId: this.clientId,
      room: this.room,
      ...state,
      timestamp: Date.now()
    };

    // 1. Send via WebSocket
    this.sendWs(message);

    // 2. Send via BroadcastChannel
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(message);
      } catch {}
    }

    // 3. Save to localStorage
    try {
      localStorage.setItem(`tp_state_${this.room}`, JSON.stringify(message));
    } catch {}

    // 4. Sync to HTTP server state cache
    fetch('/api/remote/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room: this.room,
        clientId: this.clientId,
        state: message
      })
    }).catch(() => {});
  }

  public changeRoom(newRoom: string) {
    const cleanRoom = (newRoom || 'STUDIO1').trim().toUpperCase();
    if (this.room === cleanRoom) return;
    this.room = cleanRoom;
    this.currentStatus.room = this.room;
    this.lastCommandId = 0;
    
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.close();
      } catch {}
      this.initBroadcastChannel();
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendWs({
        type: 'join',
        room: this.room,
        role: this.role,
        clientId: this.clientId
      });
    } else {
      this.connectWebSocket();
    }

    this.httpRegisterJoin();
  }

  public destroy() {
    this.isDestroyed = true;
    if (this.ws) {
      try {
        this.ws.close();
      } catch {}
      this.ws = null;
    }
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.close();
      } catch {}
      this.broadcastChannel = null;
    }
    if (this.pollInterval) clearInterval(this.pollInterval);
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
  }
}
