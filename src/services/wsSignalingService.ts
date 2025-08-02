import type { SignalPayload, StoredSignal } from './signalingService';
import type { ISignalingService } from './signalingInterface';

/**
 * Very thin WebSocket‐based signalling layer.
 * The server is expected to be available at ws://<HOST>/ signalling and simply
 * relay JSON messages of the form { to, from, payload } to the intended peer.
 *
 * This client keeps a single WebSocket connection, exposes the same API shape
 * (send, listen, ack) as the original Firestore SignalingService so that
 * useP2P and tests remain unchanged.
 */
export class WsSignalingService implements ISignalingService {
  private ws: WebSocket;
  readonly me: string;
  private listeners: Array<(id: string, sig: StoredSignal) => void> = [];
  private pendingQueue: Array<{ to: string; payload: SignalPayload }> = [];

  constructor(serverUrl: string, me: string) {
    this.me = me;
    this.ws = new WebSocket(serverUrl);
    this.ws.binaryType = 'blob'; // Must be 'blob' or 'arraybuffer'

    this.ws.addEventListener('open', () => {
      // Flush any queued outbound messages
      this.pendingQueue.forEach(({ to, payload }) => this._send(to, payload));
      this.pendingQueue = [];
    });

    this.ws.addEventListener('message', (ev) => {
      try {
        const msg = JSON.parse(ev.data as string);
        if (msg && msg.to === this.me && msg.payload) {
          const id = crypto.randomUUID?.() ?? Date.now().toString();
          this.listeners.forEach((cb) => cb(id, msg.payload as StoredSignal));
        }
      } catch (err) {
        console.error('Failed to parse signalling message', err);
      }
    });

    this.ws.addEventListener('error', (e) => {
      console.error('WebSocket signalling error', e);
    });
  }

  private _send(to: string, payload: SignalPayload) {
    this.ws.send(JSON.stringify({ to, from: this.me, payload }));
  }

  /** Send a signal to a peer */
  async send(toUserId: string, payload: SignalPayload) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this._send(toUserId, payload);
    } else {
      // Queue until connection opens
      this.pendingQueue.push({ to: toUserId, payload });
    }
  }

  /**
   * Listen for incoming signals. Returns an unsubscribe function.
   */
  listen(cb: (id: string, sig: StoredSignal) => void) {
    this.listeners.push(cb);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== cb);
    };
  }

  /** No-op for WebSocket signalling (transient). */
  async ack(_id: string) {
    /* no persistent queue to ack */
  }
}
