import type { ISignalingService } from '../services/signalingInterface';
import type { StoredSignal, SignalPayload } from "../services/signalingService";
import { 
  MESSAGE_TYPE,
  generateConnectionId,
  sanitizeId,
  type P2PManagerOptions,
  type PeerInfo,
  type P2PMessage,
  type PresenceMessage
} from './p2pUtils';

/**
 * P2PManager handles WebRTC peer connections and signaling.
 * It's responsible for establishing connections between peers,
 * sending/receiving messages, and managing presence information.
 */
export class P2PManager {
  // Basic user info
  private readonly id: string;
  private displayName: string;
  private signaling: ISignalingService | null;
  
  // Connection state
  private peerConnections: Map<string, RTCPeerConnection>;
  private dataChannels: Map<string, RTCDataChannel>;
  private pendingIceCandidates: Map<string, RTCIceCandidateInit[]>;
  private pendingSdpAnswers: Map<string, RTCSessionDescriptionInit>;
  
  // Negotiation state flags
  private makingOfferMap: Map<string, boolean>;
  private isSettingRemoteAnswerMap: Map<string, boolean>;
  private lastProcessedOfferSdps: Map<string, string>;
  private lastProcessedAnswerSdps: Map<string, string>;
  
  // Callbacks
  private onConnectionStateChangedCallback: ((id: string, state: RTCPeerConnectionState) => void) | null;
  private onMessageCallback: ((senderId: string, message: ArrayBuffer) => void) | null;
  private onPresenceUpdatedCallback: ((peerId: string, info: { id: string, isOnline: boolean, displayName?: string }) => void) | null;
  
  // Configuration options
  export interface P2PManagerOptions {
    iceServers?: RTCIceServer[];
    iceCandidatePoolSize?: number;
  }
  
  private options: P2PManagerOptions;
  
  /**
   * Create a new P2PManager instance
   * @param id User's unique identifier
   * @param displayName User's display name
   * @param signaling Optional signaling service
   * @param options Optional configuration options
   */
  constructor(
    id: string,
    displayName: string,
    signaling: ISignalingService | null = null,
    options: Partial<{ iceServers: RTCIceServer[] }> = {}
  ) {
    this.id = sanitizeId(id);
    this.displayName = displayName;
    this.signaling = signaling;
    
    // Initialize maps
    this.peerConnections = new Map();
    this.dataChannels = new Map();
    this.pendingIceCandidates = new Map();
    this.pendingSdpAnswers = new Map();
    this.makingOfferMap = new Map();
    this.isSettingRemoteAnswerMap = new Map();
    this.lastProcessedOfferSdps = new Map();
    this.lastProcessedAnswerSdps = new Map();
    
    // Initialize callbacks
    this.onConnectionStateChangedCallback = null;
    this.onMessageCallback = null;
    this.onPresenceUpdatedCallback = null;
    
    // Set default options and override with provided options
    this.options = {
      iceServers: options.iceServers || [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' }
      ],
      iceCandidatePoolSize: 10
    };
    
    // Setup signaling if provided
    if (signaling) {
      signaling.listen(this.handleSignal.bind(this));
    }
  }
  
  /**
   * Set callback for connection state changes
   * @param callback Function to call when peer connection state changes
   */
  onConnectionStateChanged(callback: (id: string, state: RTCPeerConnectionState) => void): void {
    this.onConnectionStateChangedCallback = callback;
  }
  
  /**
   * Set callback for incoming messages
   * @param callback Function to call when a message is received
   */
  onMessage(callback: (senderId: string, message: ArrayBuffer) => void): void {
    this.onMessageCallback = callback;
  }
  
  /**
   * Set callback for presence updates
   * @param callback Function to call when peer presence changes
   */
  onPresenceUpdated(callback: (peerId: string, info: { id: string, isOnline: boolean, displayName?: string }) => void): void {
    this.onPresenceUpdatedCallback = callback;
  }
  
  /**
   * Connect to a specific peer by ID
   * @param peerId ID of the peer to connect to
   */
  connectTo(peerId: string): void {
    if (peerId === this.id) {
      console.warn('Cannot connect to self');
      return;
    }
    
    const sanitizedPeerId = sanitizeId(peerId);
    
    // Don't create a new connection if one already exists
    if (this.peerConnections.has(sanitizedPeerId)) {
      console.log(`Connection to ${sanitizedPeerId} already exists`);
      return;
    }
    
    console.log(`Connecting to peer: ${sanitizedPeerId}`);
    
    // Create a new peer connection
    const pc = new RTCPeerConnection({
      iceServers: this.options.iceServers,
      iceCandidatePoolSize: this.options.iceCandidatePoolSize || 10
    });
    
    // Log connection creation
    console.log(`[P2PManager] Created new RTCPeerConnection for ${sanitizedPeerId} with config:`, {
      iceServers: this.options.iceServers,
      iceCandidatePoolSize: this.options.iceCandidatePoolSize || 10
    });
    
    // The first character of our IDs determines politeness
    const polite = this.id < sanitizedPeerId;
    
    // Store connection state
    this.peerConnections.set(sanitizedPeerId, pc);
    this.makingOfferMap.set(sanitizedPeerId, false);
    this.isSettingRemoteAnswerMap.set(sanitizedPeerId, false);
    
    // Setup peer connection events
    this.setupPeerEvents(sanitizedPeerId, pc, polite);
    
    // Create data channel
    try {
      const dataChannel = pc.createDataChannel('data');
      dataChannel.binaryType = 'arraybuffer';
      this.dataChannels.set(sanitizedPeerId, dataChannel);
      this.setupDataChannel(sanitizedPeerId, dataChannel);
    } catch (error) {
      console.error(`Error creating data channel for ${sanitizedPeerId}:`, error);
    }
  }
  
  /**
   * Send a message to a specific peer
   * @param peerId ID of the peer to send to
   * @param message Binary message to send
   * @returns true if the message was sent, false otherwise
   */
  sendTo(peerId: string, message: ArrayBuffer): boolean {
    const sanitizedPeerId = sanitizeId(peerId);
    const channel = this.dataChannels.get(sanitizedPeerId);
    
    if (!channel || channel.readyState !== 'open') {
      console.warn(`Cannot send message to ${sanitizedPeerId}: channel not open`);
      return false;
    }
    
    try {
      channel.send(message);
      return true;
    } catch (error) {
      console.error(`Error sending message to ${sanitizedPeerId}:`, error);
      return false;
    }
  }
  
  /**
   * Broadcast a message to all connected peers
   * @param message Binary message to broadcast
   * @returns Map of peer IDs to boolean indicating send success
   */
  broadcast(message: ArrayBuffer): Map<string, boolean> {
    const results = new Map<string, boolean>();
    
    for (const peerId of this.dataChannels.keys()) {
      const success = this.sendTo(peerId, message);
      results.set(peerId, success);
    }
    
    return results;
  }
  
  /**
   * Disconnect from a specific peer
   * @param peerId ID of the peer to disconnect from
   */
  disconnect(peerId: string): void {
    const sanitizedPeerId = sanitizeId(peerId);
    
    // Close and clean up data channel
    const channel = this.dataChannels.get(sanitizedPeerId);
    if (channel) {
      channel.close();
      this.dataChannels.delete(sanitizedPeerId);
    }
    
    // Close and clean up peer connection
    const pc = this.peerConnections.get(sanitizedPeerId);
    if (pc) {
      pc.close();
      this.peerConnections.delete(sanitizedPeerId);
    }
    
    // Clean up negotiation state
    this.makingOfferMap.delete(sanitizedPeerId);
    this.isSettingRemoteAnswerMap.delete(sanitizedPeerId);
    this.lastProcessedOfferSdps.delete(sanitizedPeerId);
    this.lastProcessedAnswerSdps.delete(sanitizedPeerId);
    this.pendingIceCandidates.delete(sanitizedPeerId);
    
    console.log(`Disconnected from peer: ${sanitizedPeerId}`);
  }
  
  /**
   * Disconnect from all peers
   */
  disconnectAll(): void {
    const peerIds = [...this.peerConnections.keys()];
    
    for (const peerId of peerIds) {
      this.disconnect(peerId);
    }
    
    console.log('Disconnected from all peers');
  }
  
  /**
   * Get list of connected peer IDs
   * @returns Array of connected peer IDs
   */
  getConnectedPeers(): string[] {
    return [...this.peerConnections.keys()];
  }
  
  /**
   * Get information about this peer
   * @returns Information about this peer
   */
  getPeerInfo(): { id: string, displayName: string } {
    return {
      id: this.id,
      displayName: this.displayName
    };
  }
  
  /**
   * Update your own display name and notify connected peers
   * @param displayName New display name
   */
  updateDisplayName(displayName: string): void {
    this.displayName = displayName;
    
    // Notify all connected peers
    for (const peerId of this.dataChannels.keys()) {
      this.sendPresenceUpdate(peerId);
    }
  }
  
  /**
   * Send presence update to a specific peer
   * @param peerId ID of peer to update
   */
  sendPresenceUpdate(peerId: string): void {
    const sanitizedPeerId = sanitizeId(peerId);
    const channel = this.dataChannels.get(sanitizedPeerId);
    
    if (!channel || channel.readyState !== 'open') {
      console.warn(`Cannot send presence update to ${sanitizedPeerId}: channel not open`);
      return;
    }
    
    try {
      const presenceMessage: PresenceMessage = {
        userId: this.id,
        isOnline: true,
        timestamp: Date.now()
      };
      
      const message: P2PMessage = {
        type: MESSAGE_TYPE.PRESENCE,
        payload: presenceMessage
      };
      
      // Convert to JSON and then to ArrayBuffer
      const encoder = new TextEncoder();
      const jsonStr = JSON.stringify(message);
      const data = encoder.encode(jsonStr).buffer;
      
      channel.send(data);
    } catch (error) {
      console.error(`Error sending presence update to ${sanitizedPeerId}:`, error);
    }
  }
  
  /**
   * Handle incoming signaling messages
   * @param fromId ID of the sender
   * @param signal Signal message
   */
  private handleSignal = async (fromId: string, signal: StoredSignal): Promise<void> => {
    if (!signal || !signal.type) {
      console.warn('Received invalid signal:', signal);
      return;
    }

    // Acknowledge receipt of the signal if using signaling service
    if (this.signaling) {
      try {
        await this.signaling.ack(fromId);
      } catch (error) {
        console.error('Error acknowledging signal:', error);
      }
    }
    
    const sanitizedFromId = sanitizeId(fromId);
    
    // Don't process our own signals
    if (sanitizedFromId === this.id) {
      return;
    }
    
    console.log(`Received ${signal.type} signal from ${sanitizedFromId}`);
    
    try {
      // Create connection if it doesn't exist
      let pc = this.peerConnections.get(sanitizedFromId);
      if (!pc) {
        this.connectTo(sanitizedFromId);
        pc = this.peerConnections.get(sanitizedFromId);
      }
      
      if (!pc) {
        console.error(`Failed to create connection to ${sanitizedFromId}`);
        return;
      }
      
      // Process the signal based on its type
      switch (signal.type) {
        case 'offer':
          await this.handleOfferSignal(sanitizedFromId, pc, signal);
          break;
          
        case 'answer':
          await this.handleAnswerSignal(sanitizedFromId, pc, signal);
          break;
          
        case 'ice':
          await this.handleIceCandidateSignal(sanitizedFromId, pc, signal);
          break;
          
        default:
          console.warn(`Unknown signal type: ${signal.type}`);
      }
    } catch (error) {
      console.error(`Error processing ${signal.type} from ${sanitizedFromId}:`, error);
    }
  }
  
  /**
   * Handle an offer signal
   */
  private async handleOfferSignal(
    fromId: string, 
    pc: RTCPeerConnection, 
    signal: StoredSignal
  ): Promise<void> {
    if (!signal.sdp) return;
    
    // Check if we've already processed this exact offer
    const offerSdp = JSON.stringify(signal.sdp);
    if (this.lastProcessedOfferSdps.get(fromId) === offerSdp) {
      console.log('[P2PManager] Ignoring duplicate offer');
      return;
    }
    this.lastProcessedOfferSdps.set(fromId, offerSdp);
    
    const polite = this.id < fromId;
    const makingOffer = this.makingOfferMap.get(fromId) || false;
    
    try {
      const offerCollision = pc.signalingState !== 'stable';
      
      if (offerCollision) {
        if (!polite) {
          console.log('[P2PManager] Ignoring colliding offer as impolite peer');
          return;
        }
        
        // If we're polite, roll back as needed
        if (pc.signalingState === 'have-local-offer') {
          console.log('[P2PManager] Rolling back local offer due to collision');
          await pc.setLocalDescription({ type: 'rollback' } as RTCSessionDescriptionInit);
        }
      }
      
      // Set remote description
      await pc.setRemoteDescription(signal.sdp);
      
      // Create and send answer if we're now in have-remote-offer state
      if (pc.signalingState === 'have-remote-offer') {
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        
        // Send answer
        this.sendSignalingMessage(fromId, {
          type: 'answer',
          sdp: pc.localDescription?.toJSON() as RTCSessionDescriptionInit
        });
      }
      
      // Apply any pending ICE candidates
      this.flushPendingIceCandidates(fromId, pc);
      
    } catch (error) {
      console.error('[P2PManager] Error handling offer:', error);
    }
  }
  
  /**
   * Handle an answer signal
   */
  private async handleAnswerSignal(
    fromId: string, 
    pc: RTCPeerConnection, 
    signal: StoredSignal
  ): Promise<void> {
    if (!signal.sdp) return;
    
    // Check if we've already processed this exact answer
    const answerSdp = JSON.stringify(signal.sdp);
    if (this.lastProcessedAnswerSdps.get(fromId) === answerSdp) {
      console.log('[P2PManager] Ignoring duplicate answer');
      return;
    }
    this.lastProcessedAnswerSdps.set(fromId, answerSdp);
    
    try {
      // Mark that we're setting a remote answer
      this.isSettingRemoteAnswerMap.set(fromId, true);
      
      console.log(`[P2PManager] Processing answer, current state: ${pc.signalingState}`);
      
      // If we're in stable state, we received an answer but we haven't made an offer yet
      // (which can happen in QR code exchange with timing issues)
      if (pc.signalingState === 'stable') {
        console.log(`[P2PManager] Connection in stable state, creating data channel`);
        // Create a data channel to establish communication
        const dataChannel = pc.createDataChannel(`dc-${this.id}-${fromId}`);
        dataChannel.binaryType = 'arraybuffer';
        this.dataChannels.set(fromId, dataChannel);
        this.setupDataChannel(fromId, dataChannel);
        
        // Store the SDP for later - we'll apply it after we've created our own offer
        this.pendingSdpAnswers.set(fromId, signal.sdp);
        console.log(`[P2PManager] Stored answer SDP for later application`);
        
        // Manually trigger negotiation needed event
        try {
          // Create and send offer
          this.makingOfferMap.set(fromId, true);
          pc.setLocalDescription().then(() => {
            this.sendSignalingMessage(fromId, {
              type: 'offer',
              sdp: pc.localDescription?.toJSON() as RTCSessionDescriptionInit
            });
            this.makingOfferMap.set(fromId, false);
            
            // After creating the offer, check if we can apply the pending answer
            setTimeout(() => {
              this.checkAndApplyPendingSdpAnswer(fromId, pc);
            }, 500); // Small delay to ensure the state has updated
          }).catch(err => {
            console.error('[P2PManager] Error creating offer:', err);
            this.makingOfferMap.set(fromId, false);
          });
        } catch (err) {
          console.error('[P2PManager] Error starting negotiation:', err);
        }
        
      } else if (pc.signalingState === 'have-local-offer') {
        // Normal case - we've sent an offer and now we're receiving an answer
        console.log(`[P2PManager] Applying answer SDP in have-local-offer state`);
        await pc.setRemoteDescription(signal.sdp);
      } else {
        console.log(`[P2PManager] Cannot apply answer in current state: ${pc.signalingState}`);
      }
      
      // Apply any pending ICE candidates
      this.flushPendingIceCandidates(fromId, pc);
      
    } catch (error) {
      console.error('[P2PManager] Error handling answer:', error);
    } finally {
      this.isSettingRemoteAnswerMap.set(fromId, false);
    }
  }
  
  /**
   * Handle an ICE candidate signal
   */
  private async handleIceCandidateSignal(
    fromId: string, 
    pc: RTCPeerConnection, 
    signal: StoredSignal
  ): Promise<void> {
    if (!signal.candidate) return;
    
    try {
      // Only process ICE candidates if we have a remote description
      if (pc.remoteDescription && pc.remoteDescription.type) {
        await pc.addIceCandidate(signal.candidate);
      } else {
        // Store the candidate for later
        if (!this.pendingIceCandidates.has(fromId)) {
          this.pendingIceCandidates.set(fromId, []);
        }
        this.pendingIceCandidates.get(fromId)?.push(signal.candidate);
      }
    } catch (error) {
      if (pc.signalingState === 'stable') {
        console.error('[P2PManager] Error adding ICE candidate:', error);
      } else {
        console.log(`[P2PManager] Could not add ICE candidate in state ${pc.signalingState}`);
      }
    }
  }
  
  /**
   * Applies any pending ICE candidates for a peer after the remote description has been set
   */
  private flushPendingIceCandidates(peerId: string, pc: RTCPeerConnection): void {
    const pendingCandidates = this.pendingIceCandidates.get(peerId) || [];
    if (pendingCandidates.length > 0) {
      console.log(`[P2PManager] Applying ${pendingCandidates.length} pending ICE candidates`);
      pendingCandidates.forEach(async (candidate) => {
        // Skip invalid candidates
        if (!candidate.candidate && !candidate.sdpMid && !candidate.sdpMLineIndex) {
          console.log('[P2PManager] Skipping invalid ICE candidate');
          return;
        }
        
        try {
          await pc.addIceCandidate(candidate);
        } catch (error) {
          console.error('[P2PManager] Error applying pending ICE candidate:', error);
        }
      });
      this.pendingIceCandidates.delete(peerId);
    }
  }

  /**
   * Check and apply pending SDP answer for a peer once we're in the right state
   */
  private async checkAndApplyPendingSdpAnswer(peerId: string, pc: RTCPeerConnection): Promise<void> {
    const pendingSdp = this.pendingSdpAnswers.get(peerId);
    if (pendingSdp && pc.signalingState === 'have-local-offer') {
      console.log(`[P2PManager] Applying pending SDP answer for ${peerId}`);
      try {
        await pc.setRemoteDescription(pendingSdp);
        this.pendingSdpAnswers.delete(peerId);
        // Apply any pending ICE candidates after the SDP is set
        this.flushPendingIceCandidates(peerId, pc);
      } catch (error) {
        console.error('[P2PManager] Error applying pending SDP answer:', error);
      }
    }
  }
  
  /**
   * Set up event handlers for a peer connection
   */
  private setupPeerEvents(peerId: string, pc: RTCPeerConnection, polite: boolean): void {
    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      console.log(`[P2PManager] Connection state for ${peerId}: ${pc.connectionState}`);
      
      if (this.onConnectionStateChangedCallback) {
        this.onConnectionStateChangedCallback(peerId, pc.connectionState);
      }
      
      // Clean up if disconnected
      if (pc.connectionState === 'disconnected' || 
          pc.connectionState === 'failed' || 
          pc.connectionState === 'closed') {
        this.disconnect(peerId);
      }
    };
    
    // Handle ICE candidate generation
    pc.onicecandidate = (event) => {
      if (!event.candidate) return;
      
      this.sendSignalingMessage(peerId, {
        type: 'ice',
        candidate: event.candidate.toJSON()
      });
    };
    
    // Handle negotiation needed event
    pc.onnegotiationneeded = async () => {
      try {
        // Avoid creating offers if we're already in the process
        if (this.makingOfferMap.get(peerId)) return;
        
        this.makingOfferMap.set(peerId, true);
        
        // Create and send offer
        await pc.setLocalDescription();
        
        this.sendSignalingMessage(peerId, {
          type: 'offer',
          sdp: pc.localDescription?.toJSON() as RTCSessionDescriptionInit
        });
      } catch (error) {
        console.error('[P2PManager] Error creating offer:', error);
      } finally {
        this.makingOfferMap.set(peerId, false);
      }
    };
    
    // Handle data channels created by the remote peer
    pc.ondatachannel = (event) => {
      const dataChannel = event.channel;
      dataChannel.binaryType = 'arraybuffer';
      
      this.dataChannels.set(peerId, dataChannel);
      this.setupDataChannel(peerId, dataChannel);
    };
  }
  
  /**
   * Set up event handlers for a data channel
   */
  private setupDataChannel(peerId: string, dataChannel: RTCDataChannel): void {
    // Handle message events
    dataChannel.onmessage = (event) => {
      try {
        const data = event.data;
        
        if (data instanceof ArrayBuffer) {
          try {
            // Try to parse as JSON first (for control messages like presence)
            const decoder = new TextDecoder();
            const jsonStr = decoder.decode(data);
            const message = JSON.parse(jsonStr);
            
            // Handle presence updates
            if (message.type === MESSAGE_TYPE.PRESENCE) {
              const presenceMsg = message.payload;
              if (this.onPresenceUpdatedCallback) {
                console.log(`[P2PManager] Received presence update from ${peerId}`);
                this.onPresenceUpdatedCallback(peerId, {
                  id: presenceMsg.userId,
                  isOnline: presenceMsg.isOnline
                });
                return; // Don't forward control messages
              }
            }
          } catch (jsonError) {
            // Not a JSON message, treat as regular binary message
          }
          
          // Forward regular binary messages to the application
          if (this.onMessageCallback) {
            this.onMessageCallback(peerId, data);
          }
        }
      } catch (error) {
        console.error('[P2PManager] Error handling message:', error);
      }
    };
    
    // Handle open event
    dataChannel.onopen = () => {
      console.log(`[P2PManager] Data channel opened with ${peerId}`);
      this.sendPresenceUpdate(peerId);
    };
    
    // Handle close event
    dataChannel.onclose = () => {
      console.log(`[P2PManager] Data channel closed with ${peerId}`);
    };
    
    // Handle error event
    dataChannel.onerror = (event) => {
      console.error(`[P2PManager] Data channel error with ${peerId}:`, event);
    };
  }
  
  /**
   * Send a signaling message to a peer
   */
  private sendSignalingMessage(peerId: string, message: SignalPayload): void {
    if (!this.signaling) {
      console.warn('[P2PManager] Cannot send signal: no signaling service');
      return;
    }
    
    try {
      this.signaling.send(peerId, message).catch((error) => {
        console.error('[P2PManager] Error sending signal:', error);
      });
    } catch (error) {
      console.error('[P2PManager] Error sending signal:', error);
    }
  }
}
