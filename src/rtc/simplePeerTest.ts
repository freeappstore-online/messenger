/**
 * Simple test script for SimplePeerManager
 * This file provides a way to manually test the SimplePeerManager implementation
 * and compare it with the native WebRTC implementation.
 */

import { SimplePeerManager } from './simplePeerManager';
// Import only when needed for comparison testing
// import { P2PManager } from './p2pManager';
import type { ISignalingService } from '../services/signalingInterface';
import type { SignalPayload, StoredSignal } from '../services/signalingService';

// Simple in-memory mock signaling service for testing
class MockSignalingService implements ISignalingService {
  private signals: Map<string, Map<string, any>> = new Map();
  private listeners: Array<(id: string, signal: StoredSignal) => void> = [];
  
  readonly me: string;
  
  constructor(userId: string) {
    this.me = userId;
    this.signals.set(userId, new Map());
  }

  async send(recipientId: string, payload: SignalPayload): Promise<void> {
    // Ensure recipient inbox exists
    if (!this.signals.has(recipientId)) {
      this.signals.set(recipientId, new Map());
    }
    
    const signalId = `signal-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const recipientInbox = this.signals.get(recipientId)!;
    
    // Create a stored signal from the payload
    const storedSignal: StoredSignal = {
      ...payload,
      from: this.me,
      createdAt: Date.now()
    };
    
    // Store the signal in recipient's inbox
    recipientInbox.set(signalId, storedSignal);
    console.log(`[Mock] Signal sent from ${this.me} to ${recipientId}:`, storedSignal);
    
    // Notify listeners immediately (simulating real-time)
    if (this.listeners.length > 0) {
      this.listeners.forEach(listener => {
        if (recipientId === this.me) {
          listener(signalId, storedSignal);
        }
      });
    }
  }
  
  listen(cb: (id: string, signal: StoredSignal) => void): () => void {
    // Add listener
    this.listeners.push(cb);
    
    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(cb);
      if (index !== -1) {
        this.listeners.splice(index, 1);
      }
    };
  }
  
  async ack(id: string): Promise<void> {
    // Ensure user inbox exists
    if (!this.signals.has(this.me)) {
      return;
    }
    
    // Remove signal from inbox
    const myInbox = this.signals.get(this.me)!;
    if (myInbox.has(id)) {
      myInbox.delete(id);
      console.log(`[Mock] Signal ${id} acknowledged by ${this.me}`);
    }
  }
}

/**
 * Run a test comparing SimplePeerManager and P2PManager
 */
export function runP2PTest() {
  console.log('Starting P2P test...');
  
  // Create mock signaling services for both peers
  const signalingA = new MockSignalingService('peer-a');
  const signalingB = new MockSignalingService('peer-b');
  
  // Create managers with callbacks
  const simplePeerA = new SimplePeerManager('peer-a', signalingA, {
    onMessage: (peerId, data) => {
      console.log(`[SimplePeer A] Received message from ${peerId}:`, new TextDecoder().decode(data));
    },
    onConnectionState: (peerId, state) => {
      console.log(`[SimplePeer A] Connection state with ${peerId}: ${state}`);
    },
    onDataChannelOpen: (peerId) => {
      console.log(`[SimplePeer A] Data channel open with ${peerId}`);
      
      // Send a test message once connected
      setTimeout(() => {
        const message = `Hello from SimplePeer A at ${new Date().toISOString()}`;
        console.log(`[SimplePeer A] Sending message to ${peerId}: ${message}`);
        simplePeerA.sendTo(peerId, new TextEncoder().encode(message));
      }, 1000);
    }
  });
  
  const simplePeerB = new SimplePeerManager('peer-b', signalingB, {
    onMessage: (peerId, data) => {
      console.log(`[SimplePeer B] Received message from ${peerId}:`, new TextDecoder().decode(data));
      
      // Reply to messages
      const reply = `Reply from SimplePeer B at ${new Date().toISOString()}`;
      console.log(`[SimplePeer B] Sending reply to ${peerId}: ${reply}`);
      simplePeerB.sendTo(peerId, new TextEncoder().encode(reply));
    },
    onConnectionState: (peerId, state) => {
      console.log(`[SimplePeer B] Connection state with ${peerId}: ${state}`);
    },
    onDataChannelOpen: (peerId) => {
      console.log(`[SimplePeer B] Data channel open with ${peerId}`);
    }
  });
  
  // Start the connection from peer A to peer B
  console.log('[Test] Initiating connection from Peer A to Peer B...');
  simplePeerA.connectTo('peer-b');
  
  // For comparison, also create a test with the original P2PManager
  // This is commented out for now, but can be uncommented to compare both implementations
  /*
  const nativeA = new P2PManager('native-a', signalingA, {
    onMessage: (peerId, data) => {
      console.log(`[Native A] Received message from ${peerId}:`, new TextDecoder().decode(data));
    },
    onConnectionState: (peerId, state) => {
      console.log(`[Native A] Connection state with ${peerId}: ${state}`);
    },
    onDataChannelOpen: (peerId) => {
      console.log(`[Native A] Data channel open with ${peerId}`);
      
      // Send a test message once connected
      setTimeout(() => {
        const message = `Hello from Native A at ${new Date().toISOString()}`;
        console.log(`[Native A] Sending message to ${peerId}: ${message}`);
        nativeA.sendTo(peerId, new TextEncoder().encode(message));
      }, 1000);
    }
  });
  
  const nativeB = new P2PManager('native-b', signalingB, {
    onMessage: (peerId, data) => {
      console.log(`[Native B] Received message from ${peerId}:`, new TextDecoder().decode(data));
      
      // Reply to messages
      const reply = `Reply from Native B at ${new Date().toISOString()}`;
      console.log(`[Native B] Sending reply to ${peerId}: ${reply}`);
      nativeB.sendTo(peerId, new TextEncoder().encode(reply));
    },
    onConnectionState: (peerId, state) => {
      console.log(`[Native B] Connection state with ${peerId}: ${state}`);
    },
    onDataChannelOpen: (peerId) => {
      console.log(`[Native B] Data channel open with ${peerId}`);
    }
  });
  
  // Start the connection from native A to native B
  console.log('[Test] Initiating connection from Native A to Native B...');
  nativeA.connectTo('native-b');
  */
  
  return {
    simplePeerA,
    simplePeerB,
    // nativeA,
    // nativeB,
    cleanup: () => {
      // Clean up connections
      simplePeerA.disconnectFrom('peer-b');
      simplePeerB.disconnectFrom('peer-a');
      // nativeA.disconnectFrom('native-b');
      // nativeB.disconnectFrom('native-a');
    }
  };
}

// Expose the test function to the window for manual testing in the browser
if (typeof window !== 'undefined') {
  (window as any).runP2PTest = runP2PTest;
}
