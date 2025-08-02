import Peer from "simple-peer";
import type { ISignalingService } from "../services/signalingInterface";
import type { P2PManagerOptions } from "./p2pManager";

// Message types for P2P communication
const MESSAGE_TYPE = {
  CHAT: 0,      // Regular chat message
  PRESENCE: 1,  // Presence/status update
} as const;

// Type for P2P messages
type P2PMessageType = typeof MESSAGE_TYPE[keyof typeof MESSAGE_TYPE];

// Message format for P2P messages
// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface P2PMessage {
  type: P2PMessageType;
  payload: any;
}

// Presence update message
interface PresenceMessage {
  userId: string;
  isOnline: boolean;
  timestamp: number;
};

interface PeerInfo {
  peer: Peer.Instance;
  connected: boolean;
  isOnline: boolean;
}

/**
 * SimplePeerManager is an alternative implementation of P2P connectivity
 * using the simple-peer library instead of raw WebRTC APIs.
 * It maintains the same API as P2PManager for seamless swapping.
 */
export class SimplePeerManager {
  private peers: Map<string, PeerInfo> = new Map();

  private readonly myId: string;
  private readonly signaling: ISignalingService;
  private readonly opts: P2PManagerOptions;

  constructor(
    myId: string,
    signaling: ISignalingService,
    opts: P2PManagerOptions
  ) {
    this.myId = myId;
    this.signaling = signaling;
    this.opts = opts;
    // Start listening to signaling events immediately
    this.signaling.listen(async (docId, sig) => {
      const fromId = this.sanitize(sig.from);
      
      // Handle incoming signals from remote peers
      if (sig.type === "simple-peer" && sig.data) {
        let peer = this.peers.get(fromId);
        
        // If we don't have a peer instance yet and we received a signal,
        // create one in non-initiator mode to accept the incoming connection
        if (!peer) {
          peer = this.createPeer(fromId, false);
          this.peers.set(fromId, peer);
        }
        
        // Feed the signal to simple-peer
        try {
          peer.peer.signal(sig.data);
        } catch (err) {
          console.error("Error processing signal:", err);
        }
        
        // Acknowledge the signal
        await this.signaling.ack(docId);
      }
    });
  }

  /* ---------------- public API ---------------- */
  async connectTo(peerId: string): Promise<void> {
    const targetId = this.sanitize(peerId);
    
    // Check if we already have a connection
    let peer = this.peers.get(targetId);
    if (peer?.connected) return;
    
    // If we have a peer but it's not connected, destroy it and create a new one
    if (peer) {
      peer.peer.destroy();
      this.peers.delete(targetId);
    }
    
    // Create a new peer as initiator
    peer = this.createPeer(targetId, true);
    this.peers.set(targetId, peer);
  }

  disconnectFrom(peerId: string) {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    
    peer.peer.destroy();
    this.peers.delete(peerId);
    
    // Update connection state to closed
    this.opts.onConnectionState?.(peerId, "closed");
  }

  sendTo(peerId: string, bytes: ArrayBuffer): boolean {
    const peer = this.peers.get(peerId);
    if (!peer?.connected) return false;
    
    try {
      peer.peer.send(bytes);
      return true;
    } catch {
      return false;
    }
  }

  broadcast(bytes: ArrayBuffer) {
    this.peers.forEach((_, pid) => this.sendTo(pid, bytes));
  }
  
  /**
   * Broadcasts presence status to all connected peers
   * 
   * @param isOnline - Whether this peer is online
   * @returns The number of peers that received the update
   */
  broadcastPresence(isOnline: boolean): number {
    let sentCount = 0;
    
    // Create a presence message
    const presenceMsg: PresenceMessage = {
      userId: this.myId,
      isOnline,
      timestamp: Date.now()
    };
    
    // Encode as JSON
    const encoder = new TextEncoder();
    const jsonBytes = encoder.encode(JSON.stringify(presenceMsg));
    
    // Create the final message with type prefix
    const msgBuffer = new ArrayBuffer(1 + jsonBytes.byteLength);
    const msgView = new Uint8Array(msgBuffer);
    msgView[0] = MESSAGE_TYPE.PRESENCE; // Set message type
    msgView.set(new Uint8Array(jsonBytes), 1); // Add JSON payload
    
    // Send to all peers
    this.peers.forEach((peer, pid) => {
      if (peer.connected) {
        if (this.sendTo(pid, msgBuffer)) {
          sentCount++;
        }
      }
    });
    
    return sentCount;
  }

  /* ---------------- internal helpers ---------------- */
  private sanitize(id: string): string {
    // Use the same sanitization logic as in SignalingService
    // Also log the sanitized ID for debugging purposes
    const sanitized = id.replace(/\s|\u{1F4CB}/gu, "");
    if (sanitized !== id) {
      console.log(`[SimplePeerManager ${this.myId}] Sanitized ID: ${id} -> ${sanitized}`);
    }
    return sanitized;
  }

  private createPeer(peerId: string, initiator: boolean): PeerInfo {
    // Create a new simple-peer instance
    const peer = new Peer({
      initiator,
      trickle: true, // Enable trickle ICE
      config: {
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
      }
    });

    const peerInfo: PeerInfo = {
      peer,
      connected: false,
      isOnline: false
    };

    // Set up event handlers
    peer.on("signal", (data) => {
      // Send signaling data to the remote peer
      this.signaling.send(peerId, {
        type: "simple-peer",
        data
      });
    });

    peer.on("connect", () => {
      peerInfo.connected = true;
      this.opts.onConnectionState?.(peerId, "connected");
      this.opts.onDataChannelOpen?.(peerId);
    });

    peer.on("data", (data) => {
      try {
        // Try to parse as a P2P message first
        const buffer = data as ArrayBuffer;
        const view = new DataView(buffer);
        const messageType = view.getUint8(0);
        
        // Handle presence update message
        if (messageType === MESSAGE_TYPE.PRESENCE) {
          const decoder = new TextDecoder();
          const jsonStr = decoder.decode(buffer.slice(1));
          const message = JSON.parse(jsonStr) as PresenceMessage;
          
          if (message.userId && typeof message.isOnline === 'boolean') {
            peerInfo.isOnline = message.isOnline;
            this.opts.onPresenceUpdate?.(peerId, message.isOnline);
            return;
          }
        }
        
        // Default to regular message handling
        this.opts.onMessage(peerId, buffer);
      } catch (err) {
        // If any parsing error occurs, treat as regular binary message
        console.error("Error processing message:", err);
        this.opts.onMessage(peerId, data as ArrayBuffer);
      }
    });

    peer.on("close", () => {
      peerInfo.connected = false;
      this.opts.onConnectionState?.(peerId, "closed");
      this.peers.delete(peerId);
    });

    peer.on("error", (err) => {
      console.error("SimplePeer error:", err);
      peerInfo.connected = false;
      this.opts.onConnectionState?.(peerId, "failed");
    });

    return peerInfo;
  }
}
