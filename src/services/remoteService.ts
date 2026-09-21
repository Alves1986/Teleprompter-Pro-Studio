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

export class RemoteClient {
  private room: string;
  private role: 'host' | 'controller';
  private ws: WebSocket | null = null;
  private broadcastChannel: BroadcastChannel | null = null;
  private pollInterval: any = null;
  private reconnectTimeout: any = null;
  private heartbeatInterval: any = null;
  private lastCommandId = 0;
  private isDestroyed = false;

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
   * BroadcastChannel for instant 0ms local cross-tab sync
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
            this.updateStatus({ isConnected: true, controllersCount: Math.max(1, this.currentStatus.controllersCount) });
            const action = data.action;
            const payload = data.payload !== undefined ? data.payload : data;
            this.onCommandCb?.(action, payload);
          } else if (data.type === 'join') {
            if (data.role === 'controller' && this.role === 'host') {
              this.updateStatus({ controllersCount: Math.max(1, this.currentStatus.controllersCount + 1) });
            }
          }
        };

        // Announce presence via local broadcast channel
        this.broadcastChannel.postMessage({
          type: 'join',
          room: this.room,
          role: this.role
        });
      } catch (e) {
        console.warn('BroadcastChannel error:', e);
      }
    }
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
          const payload = cmd.payload !== undefined ? cmd.payload : cmd;
          this.onCommandCb?.(cmd.action, payload);
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
          role: this.role
        });

        // Start 15s ping-pong heartbeat for Cloud Run / reverse proxy persistence
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = setInterval(() => {
          if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.sendWs({ type: 'ping' });
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
              const action = msg.action;
              const payload = msg.payload !== undefined ? msg.payload : msg;
              this.onCommandCb?.(action, payload);
            }
          } else if (msg.type === 'request_sync') {
            if (this.role === 'host') {
              this.onCommandCb?.('request_sync', {});
            }
          }
        } catch (err) {
          console.warn('Remote ws message parse error:', err);
        }
      };

      this.ws.onclose = () => {
        if (this.isDestroyed) return;
        if (this.currentStatus.mode === 'websocket') {
          this.updateStatus({ mode: 'polling' });
        }
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        
        // Reconnect WebSocket after 3 seconds
        clearTimeout(this.reconnectTimeout);
        this.reconnectTimeout = setTimeout(() => {
          this.connectWebSocket();
        }, 3000);
      };

      this.ws.onerror = () => {
        // Socket error: fallback to polling
        if (this.currentStatus.mode === 'websocket') {
          this.updateStatus({ mode: 'polling' });
        }
      };
    } catch (e) {
      console.warn('Failed to initialize WebSocket:', e);
      this.updateStatus({ mode: 'polling' });
    }
  }

  /**
   * HTTP REST fallback polling
   * Ensures 100% reliable command delivery even through restrictive corporate firewalls or non-WebSocket mobile browsers
   */
  private startHttpPolling() {
    // Initial join registration via HTTP REST
    this.httpRegisterJoin();

    // Poll every 1200ms
    if (this.pollInterval) clearInterval(this.pollInterval);
    this.pollInterval = setInterval(async () => {
      if (this.isDestroyed) return;
      // If WebSocket is active and open, HTTP polling can run less aggressively (every 5s)
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        return;
      }
      await this.httpPoll();
    }, 1200);
  }

  private async httpRegisterJoin() {
    try {
      const res = await fetch('/api/remote/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room: this.room, role: this.role })
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
    } catch {
      // Ignored if offline
    }
  }

  private async httpPoll() {
    try {
      const url = `/api/remote/poll?room=${encodeURIComponent(this.room)}&role=${this.role}&since=${this.lastCommandId}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        this.updateStatus({
          isConnected: true,
          mode: 'polling',
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
            const payload = cmd.payload !== undefined ? cmd.payload : cmd;
            this.onCommandCb?.(cmd.action, payload);
          }
        }
      }
    } catch {
      // Polling network drop
    }
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
   */
  public sendCommand(action: string, payload: any = {}) {
    const message = {
      type: 'command',
      action,
      payload,
      ...payload,
      timestamp: Date.now()
    };

    // 1. Send via WebSocket if available
    this.sendWs(message);

    // 2. Broadcast via BroadcastChannel locally for other tabs
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(message);
      } catch {}
    }

    // 3. Save to localStorage for cross-tab event fallback
    try {
      localStorage.setItem(`tp_cmd_${this.room}`, JSON.stringify(message));
    } catch {}

    // 4. Always send via HTTP REST endpoint as reliable backup
    fetch('/api/remote/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room: this.room,
        action,
        payload
      })
    }).catch(() => {});
  }

  /**
   * Broadcast state (called by host)
   */
  public syncState(state: Partial<RemoteSyncState>) {
    const message = {
      type: 'sync_state',
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

    // 3. Save to localStorage for cross-tab event fallback
    try {
      localStorage.setItem(`tp_state_${this.room}`, JSON.stringify(message));
    } catch {}

    // 4. Sync to HTTP server state cache
    fetch('/api/remote/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        room: this.room,
        state: message
      })
    }).catch(() => {});
  }

  public changeRoom(newRoom: string) {
    if (this.room === newRoom.trim().toUpperCase()) return;
    this.room = newRoom.trim().toUpperCase();
    this.currentStatus.room = this.room;
    
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
        role: this.role
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
