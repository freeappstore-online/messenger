import type { SignalPayload, StoredSignal } from './signalingService';

/**
 * Common interface for all signaling service implementations
 * This ensures compatibility between different implementations (Firestore, WebSocket, etc.)
 */
export interface ISignalingService {
  /**
   * The ID of the current user
   */
  readonly me: string;
  
  /**
   * Send a signal to a specific user
   */
  send(toUserId: string, payload: SignalPayload): Promise<void>;
  
  /**
   * Listen for incoming signals
   * Returns an unsubscribe function
   */
  listen(cb: (id: string, sig: StoredSignal) => void): () => void;
  
  /**
   * Acknowledge receipt of a signal
   */
  ack(id: string): Promise<void>;
}
