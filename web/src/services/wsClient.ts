import type { User } from 'firebase/auth';
import type { ServerMessage } from '@famchat/shared';

export type { ServerMessage } from '@famchat/shared';
export type MessageHandler = (msg: ServerMessage) => void;
export type ConnectHandler = () => void;

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8082';
const RECONNECT_DELAY = 3000;

export class WsClient {
  private ws: WebSocket | null = null;
  private user: User | null = null;
  private handlers = new Set<MessageHandler>();
  private connectHandlers = new Set<ConnectHandler>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  async connect(user: User) {
    this.user = user;
    this.disposed = false;
    await this.doConnect();
  }

  private async doConnect() {
    if (this.disposed || !this.user) return;

    const token = await this.user.getIdToken();
    const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(token)}`);

    ws.onopen = () => {
      console.log('[WS] Connected');
      this.ws = ws;
      for (const h of this.connectHandlers) h();
    };

    ws.onmessage = (e) => {
      try {
        const msg: ServerMessage = JSON.parse(e.data as string);
        console.debug('[WS] recv', msg.type, msg.type === 'signal' ? (msg as { payload?: { type?: string } }).payload?.type : '');
        for (const h of this.handlers) h(msg);
      } catch (err) {
        console.error('[WS] Parse error:', err);
      }
    };

    ws.onclose = () => {
      console.log('[WS] Disconnected');
      this.ws = null;
      this.scheduleReconnect();
    };

    ws.onerror = (err) => {
      console.error('[WS] Error:', err);
      ws.close();
    };
  }

  private scheduleReconnect() {
    if (this.disposed) return;
    this.reconnectTimer = setTimeout(() => this.doConnect(), RECONNECT_DELAY);
  }

  send(msg: unknown) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      console.warn('[WS] send() dropped — not connected', (msg as { type?: string })?.type);
    }
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  onConnect(handler: ConnectHandler): () => void {
    this.connectHandlers.add(handler);
    return () => this.connectHandlers.delete(handler);
  }

  disconnect() {
    this.disposed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
  }

  get connected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
