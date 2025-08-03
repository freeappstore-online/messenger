import { P2PManager } from '../../src/rtc/p2pManager2';
import type { P2PManagerOptions } from '../../src/rtc/p2pUtils';
import type { StoredSignal } from '../../src/services/signalingService';
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { MockSignalingService, createSignal } from './mockSignalingService';

type MockFn = ReturnType<typeof vi.fn>;


// We're now importing MockSignalingService from './mockSignalingService'

// We're now importing createSignal from './mockSignalingService'

describe('P2PManager', () => {
  let signalingService: MockSignalingService;
  let p2pManager: P2PManager;
  let messageCallback: MockFn;
  let connectionStateCallback: MockFn;
  let dataChannelOpenCallback: MockFn;

  beforeEach(() => {
    // Reset mocks and services before each test
    signalingService = new MockSignalingService('zzzz'); // Using zzzz to be polite (lexicographically larger than 'aaaa')
    messageCallback = vi.fn();
    connectionStateCallback = vi.fn();
    dataChannelOpenCallback = vi.fn();

    p2pManager = new P2PManager('zzzz', 'TestUser', signalingService, {
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    
    // Set callbacks using the proper methods
    p2pManager.onMessage(messageCallback);
    p2pManager.onConnectionStateChanged(connectionStateCallback);
  });

  test('should handle offer signaling messages correctly', async () => {
    // Connect to the peer to initialize the peer objects
    await p2pManager.connectTo('aaaa');

    // Clear any messages sent during connect
    signalingService.sentMessages = [];
    
    // Send an offer signal from the remote peer
    const offerSignal: StoredSignal = {
      from: 'aaaa',
      type: 'offer',
      sdp: { type: 'offer', sdp: 'mock-sdp-offer' },
      createdAt: Date.now()
    };
    
    // Emit the offer signal
    signalingService.emitSignal('doc-1', offerSignal);
    
    // Wait for async operations to complete
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // We expect the P2PManager to have sent an answer in response to the offer
    expect(signalingService.sentMessages.length).toBe(1);
    expect(signalingService.sentMessages[0].to).toBe('aaaa');
    expect(signalingService.sentMessages[0].payload.type).toBe('answer');
    
    // Check that the signal was acknowledged
    expect(signalingService.acknowledgedIds).toContain('doc-1');
  });

  test('should handle duplicate offer correctly', async () => {
    // Connect to the peer to initialize the peer objects
    await p2pManager.connectTo('aaaa');

    // Clear any messages sent during connect
    signalingService.sentMessages = [];
    
    // Send an offer signal
    const offerSignal: StoredSignal = {
      from: 'aaaa',
      type: 'offer',
      sdp: { type: 'offer', sdp: 'mock-sdp-offer' },
      createdAt: Date.now()
    };
    
    // Emit the offer signal
    signalingService.emitSignal('doc-1', offerSignal);
    
    // Wait for async operations to complete
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // We expect an answer was sent
    expect(signalingService.sentMessages.length).toBe(1);
    expect(signalingService.sentMessages[0].payload.type).toBe('answer');
    
    // Clear sent messages
    signalingService.sentMessages = [];
    
    // Send the same offer again (duplicate)
    signalingService.emitSignal('doc-1', offerSignal);
    
    // Wait for any potential async operations
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // No new messages should have been sent (duplicate detected)
    expect(signalingService.sentMessages.length).toBe(0);
    
    // But the signal should still be acknowledged
    expect(signalingService.acknowledgedIds).toContain('doc-1');
  });

  test('should handle answer signaling messages correctly', async () => {
    // Connect to the peer to initialize the peer objects
    await p2pManager.connectTo('aaaa');
    signalingService.sentMessages = [];
    
    // Create an answer signal
    const answerSignal: StoredSignal = {
      from: 'aaaa',
      type: 'answer',
      sdp: { type: 'answer', sdp: 'mock-sdp-answer' },
      createdAt: Date.now()
    };
    
    // Emit the answer signal
    signalingService.emitSignal('doc-1', answerSignal);
    
    // No response needed for an answer
    expect(signalingService.sentMessages.length).toBe(0);
    
    // But the signal should be acknowledged
    expect(signalingService.acknowledgedIds).toContain('doc-1');
  });

  test('should handle duplicate answer correctly', async () => {
    // Connect to the peer to initialize the peer objects
    await p2pManager.connectTo('aaaa');
    signalingService.sentMessages = [];
    
    // Create an answer signal
    const answerSignal: StoredSignal = {
      from: 'aaaa',
      type: 'answer',
      sdp: { type: 'answer', sdp: 'mock-sdp-answer' },
      createdAt: Date.now()
    };
    
    // Emit the answer signal
    signalingService.emitSignal('doc-1', answerSignal);
    
    // No response needed for an answer
    expect(signalingService.sentMessages.length).toBe(0);
    
    // Signal should be acknowledged
    expect(signalingService.acknowledgedIds).toContain('doc-1');
    
    // Clear acknowledged IDs
    signalingService.acknowledgedIds = [];
    
    // Send the same answer signal again
    signalingService.emitSignal('doc-2', answerSignal);
    
    // We expect no messages sent, but the signal should be acknowledged
    expect(signalingService.sentMessages.length).toBe(0);
    expect(signalingService.acknowledgedIds).toContain('doc-2');
  });

  test('should handle ICE candidates correctly', async () => {
    // Connect to the peer to initialize the peer objects
    await p2pManager.connectTo('aaaa');
    
    // Create an ICE candidate signal
    const iceSignal: StoredSignal = {
      from: 'aaaa',
      type: 'ice',
      candidate: { 
        candidate: 'mock-ice-candidate', 
        sdpMid: '0', 
        sdpMLineIndex: 0 
      },
      createdAt: Date.now()
    };
    
    // Emit the ICE candidate signal
    signalingService.emitSignal('doc-1', iceSignal);
    
    // Wait for async operations to complete
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // ICE candidate should be acknowledged
    expect(signalingService.acknowledgedIds).toContain('doc-1');
  });

  test('should queue ICE candidates when no remote description', async () => {
    // Create a peer connection first
    await p2pManager.connectTo('aaaa');
    
    // Get the peer object from the P2PManager
    const peerMap = (p2pManager as any).peers;
    const peer = peerMap.get('aaaa');
    
    // Ensure the peer exists
    expect(peer).toBeDefined();
    
    // Reset remoteDescription to simulate no remote desc state
    peer.pc.remoteDescription = null;
    
    // Initialize the pendingCandidates array if it doesn't exist
    peer.pendingCandidates = [];
    
    // Send an ICE candidate signal
    const iceSignal: StoredSignal = {
      from: 'aaaa',
      type: 'ice',
      candidate: { 
        candidate: 'mock-ice-candidate', 
        sdpMid: '0', 
        sdpMLineIndex: 0 
      },
      createdAt: Date.now()
    };
    
    // Emit the ICE candidate signal
    signalingService.emitSignal('doc-1', iceSignal);
    
    // Wait for async operations to complete
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Candidates should be pending since there's no remote description
    expect(peer.pendingCandidates?.length).toBe(1);
  });

  // Adding a test for sending messages
  test('should send messages over data channel', async () => {
    // Connect to the peer to initialize the peer objects
    await p2pManager.connectTo('aaaa');
    
    // Get the peer object from the P2PManager
    const peerMap = (p2pManager as any).peers;
    const peer = peerMap.get('aaaa');
    
    // Create a mock data channel
    peer.ch = {
      readyState: 'open',
      send: vi.fn()
    } as any;
    
    // Create a message to send
    const message = new ArrayBuffer(8);
    
    // Send the message
    p2pManager.sendTo('aaaa', message);
    
    // Check that the message was sent
    expect(peer.ch.send).toHaveBeenCalledWith(message);
  });

  // Test broadcast
  test('should broadcast messages to all peers', async () => {
    // Connect to two peers to initialize the peer objects
    await p2pManager.connectTo('aaaa');
    await p2pManager.connectTo('bbbb');
    
    // Get the peer objects from the P2PManager
    const peerMap = (p2pManager as any).peers;
    const peer1 = peerMap.get('aaaa');
    const peer2 = peerMap.get('bbbb');
    
    // Create mock data channels
    peer1.ch = {
      readyState: 'open',
      send: vi.fn()
    } as any;
    
    peer2.ch = {
      readyState: 'open',
      send: vi.fn()
    } as any;
    
    // Create a message to broadcast
    const message = new ArrayBuffer(8);
    
    // Broadcast the message
    p2pManager.broadcast(message);
    
    // Check that the message was sent to both peers
    expect(peer1.ch.send).toHaveBeenCalledWith(message);
    expect(peer2.ch.send).toHaveBeenCalledWith(message);
  });
});
