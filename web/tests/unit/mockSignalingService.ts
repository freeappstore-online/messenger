import type { SignalPayload, StoredSignal } from '../../src/services/signalingService';
import type { ISignalingService } from '../../src/services/signalingInterface';

/**
 * A fully in-memory mock signaling service for testing.
 * This implementation has the same API as both FirestoreSignalingService and WsSignalingService,
 * but doesn't interact with any external services.
 */
export class MockSignalingService implements ISignalingService {
  // Track sent messages for test assertions
  sentMessages: Array<{ to: string; payload: any }> = [];
  
  // Track acknowledged signals for test assertions
  acknowledgedIds: string[] = [];
  
  // Store signal handlers
  private signalHandlers: Array<(id: string, sig: StoredSignal) => void> = [];

  constructor(readonly me: string) {}

  /**
   * Send a signal to a peer
   */
  async send(toUserId: string, payload: SignalPayload): Promise<void> {
    // Record the message for test assertions
    this.sentMessages.push({ to: toUserId, payload });
    return Promise.resolve();
  }
  
  /**
   * Listen for incoming signals
   * @returns Unsubscribe function
   */
  listen(cb: (id: string, sig: StoredSignal) => void): () => void {
    // Add the handler to our list
    this.signalHandlers.push(cb);
    
    // Return unsubscribe function
    return () => {
      this.signalHandlers = this.signalHandlers.filter(handler => handler !== cb);
    };
  }
  
  /**
   * Acknowledge receipt of a signal
   * In a real implementation, this would delete the document from Firestore
   * In our mock, we track it for test assertions but don't do anything else
   */
  async ack(id: string): Promise<void> {
    // Track for test assertions
    this.acknowledgedIds.push(id);
    return Promise.resolve();
  }

  /**
   * Test helper to simulate receiving a signal
   */
  emitSignal(id: string, signal: StoredSignal): void {
    // Notify all handlers of the incoming signal
    this.signalHandlers.forEach(handler => handler(id, signal));
  }
}

/**
 * Helper function to create a test signal object
 */
export function createSignal(type: string, from: string, data: any = {}): StoredSignal {
  return {
    type: type as any,
    from,
    createdAt: Date.now(),
    ...data
  };
}
