import type { StoredSignal } from "../services/signalingService";
import type { ISignalingService } from '../services/signalingInterface';

export interface P2PManagerOptions {
  /** Fired whenever a data-channel message arrives. */
  onMessage: (peerId: string, bytes: ArrayBuffer) => void;
  /** Fired whenever a peer connection state changes (connecting, connected, etc.) */
  onConnectionState?: (peerId: string, state: RTCPeerConnectionState) => void;
  /** Fired when the data channel open event fires (useful for UI) */
  onDataChannelOpen?: (peerId: string) => void;
  /** Fired when a peer is connected successfully */
  onConnected?: (peerId: string) => void;
  /** Fired when a peer is disconnected */
  onDisconnected?: (peerId: string) => void;
  /** Fired when presence information is received about other peers */
  onPresenceUpdate?: (peerId: string, isOnline: boolean) => void;
  /** Custom ICE servers to use for WebRTC connections */
  iceServers?: RTCIceServer[];
}

// Message types for P2P communication
const MESSAGE_TYPE = {
  CHAT: 0, // Regular chat message
  PRESENCE: 1, // Presence/status update
} as const;

// Type for P2P messages
type P2PMessageType = (typeof MESSAGE_TYPE)[keyof typeof MESSAGE_TYPE];

// Message format for P2P messages
interface P2PMessage {
  type: P2PMessageType;
  payload: any;
}

// Presence update message
interface PresenceMessage {
  userId: string;
  isOnline: boolean;
  timestamp: number;
}

interface PeerInfo {
  id: string; // The ID of the peer
  pc: RTCPeerConnection;
  ch?: RTCDataChannel;
  pendingCandidates?: RTCIceCandidateInit[];
  makingOffer: boolean;
  settingRemoteAnswer: boolean;
  polite: boolean;
  lastProcessedOfferSdp?: string;
  lastProcessedAnswerSdp?: string;
  isOnline: boolean;
}

/**
 * P2PManager contains all pure WebRTC + signalling logic.
 * It is UI-agnostic and has no React imports; it emits events via callbacks.
 */
/**
 * P2PManager handles WebRTC peer connections, signaling, and data channel communication.
 *
 * It implements the Perfect Negotiation pattern for WebRTC connection establishment
 * and provides an easy-to-use API for sending messages to specific peers or broadcasting
 * to all connected peers.
 */
export class P2PManager {
  /** The unique ID of this peer */
  readonly myId: string;
  
  /** The signaling service used to exchange WebRTC messages */
  readonly signaling: ISignalingService;
  
  /** Options for the P2PManager instance */
  readonly opts: P2PManagerOptions;
  
  /** Maps peer IDs to their connection info */
  private peers: Map<string, PeerInfo> = new Map();

  /**
   * Creates a new P2PManager
   *
   * @param myId - The unique ID of this peer
   * @param signaling - The signaling service used to exchange WebRTC messages
   * @param opts - Options for the P2PManager instance
   */
  constructor(myId: string, signaling: ISignalingService, opts: P2PManagerOptions) {
    this.myId = myId;
    this.signaling = signaling;
    this.opts = opts;
    // start listening to signalling events immediately
    this.signaling.listen(async (docId, sig) => {
      const fromId = this.sanitize(sig.from);
      let peer = this.peers.get(fromId);
      if (!peer) {
        peer = this.createPeer(fromId);
        this.peers.set(fromId, peer);
      }
      await this.handleSignal(peer, fromId, docId, sig);
    });
  }

  /**
   * Initiates a WebRTC connection to a peer
   *
   * This will set up the RTCPeerConnection, create a data channel,
   * and begin the signaling process. The connection is not established
   * until the signaling process completes.
   *
   * @param peerId - The ID of the peer to connect to
   * @returns A promise that resolves when the connection setup process begins
   */
  async connectTo(peerId: string): Promise<void> {
    const targetId = this.sanitize(peerId);

    let peer = this.peers.get(targetId);
    if (!peer) {
      peer = this.createPeer(targetId);
      this.peers.set(targetId, peer);
    }

    // if already connected we are done
    if (peer.pc.connectionState === "connected") return;

    // ensure stable before creating a new offer
    if (peer.pc.signalingState !== "stable") {
      peer.pc.close();
      peer = this.createPeer(targetId);
      this.peers.set(targetId, peer);
    }

    // create data channel if needed
    if (!peer.ch) {
      const ch = peer.pc.createDataChannel("chat");
      ch.binaryType = "arraybuffer";
      ch.onopen = () => this.opts.onDataChannelOpen?.(targetId);
      ch.onmessage = (e) =>
        this.opts.onMessage(targetId, e.data as ArrayBuffer);
      peer.ch = ch;
    }

    peer.makingOffer = true;
    const offer = await peer.pc.createOffer();
    await peer.pc.setLocalDescription(offer);
    peer.makingOffer = false;
    await this.signaling.send(targetId, { type: "offer", sdp: offer });
  }

  /**
   * Disconnects from a peer
   *
   * This will close the RTCPeerConnection and remove the peer from the internal map.
   *
   * @param peerId - The ID of the peer to disconnect from
   */
  disconnectFrom(peerId: string) {
    const p = this.peers.get(peerId);
    if (!p) return;
    p.pc.close();
    this.peers.delete(peerId);
  }

  /**
   * Sends binary data to a specific peer
   *
   * This will send the data via the established data channel.
   *
   * @param peerId - The ID of the peer to send to
   * @param bytes - The binary data to send
   * @returns Whether the data was sent successfully
   */
  sendTo(peerId: string, bytes: ArrayBuffer): boolean {
    const p = this.peers.get(peerId);
    if (!p?.ch || p.ch.readyState !== "open") return false;
    try {
      p.ch.send(bytes);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Broadcasts binary data to all connected peers
   *
   * @param bytes - The binary data to broadcast
   * @returns The number of peers that successfully received the data
   */
  broadcast(bytes: ArrayBuffer): number {
    let sentCount = 0;
    this.peers.forEach((_p, pid) => {
      if (this.sendTo(pid, bytes)) {
        sentCount++;
      }
    });
    return sentCount;
  }

  /**
   * Broadcasts a presence update to all connected peers
   *
   * @param isOnline - Whether this peer is online
   * @returns The number of peers that successfully received the update
   */
  broadcastPresence(isOnline: boolean): number {
    console.log(
      `[P2PManager] Broadcasting presence: ${isOnline ? "online" : "offline"}`
    );
    let sentCount = 0;

    // Create presence message
    const presenceMessage: PresenceMessage = {
      userId: this.myId,
      isOnline,
      timestamp: Date.now(),
    };

    // Wrap in P2P message format
    const message: P2PMessage = {
      type: MESSAGE_TYPE.PRESENCE,
      payload: presenceMessage,
    };

    // Convert to JSON and then to binary
    const jsonStr = JSON.stringify(message);
    const encoder = new TextEncoder();
    const bytes = encoder.encode(jsonStr).buffer;

    // Send to all connected peers
    for (const peer of this.peers.values()) {
      if (!peer.ch || peer.ch.readyState !== "open") continue;

      try {
        peer.ch.send(bytes);
        sentCount++;
      } catch (e) {
        console.error(`[P2PManager] Failed to send presence to ${peer.id}:`, e);
      }
    }

    return sentCount;
  }

  /* ---------------- internal helpers ---------------- */
  /**
   * Sanitizes a peer ID by removing whitespace and a specific Unicode character
   *
   * @param id - The peer ID to sanitize
   * @returns The sanitized peer ID
   */
  private sanitize(id: string): string {
    return id.replace(/\s|\u{1F4CB}/gu, "");
  }

  /**
   * Creates a new peer connection and sets up event handlers
   *
   * This initializes a new RTCPeerConnection with the appropriate configuration
   * and sets up all necessary event handlers. The polite/impolite role is determined
   * by lexicographic comparison of peer IDs.
   *
   * @param peerId - The ID of the peer to create
   * @returns The peer information object
   */
  private createPeer(peerId: string): PeerInfo {
    console.log(`[P2PManager] Creating peer ${peerId}`);
    const isPolite = this.myId > peerId;
    console.log(`[P2PManager] I am ${isPolite ? "polite" : "impolite"} peer`);

    const config = {
      iceServers: this.opts.iceServers || [
        { urls: "stun:stun.l.google.com:19302" },
      ],
    };

    const pc = new RTCPeerConnection(config);
    const peer: PeerInfo = {
      id: peerId,
      pc,
      polite: isPolite,
      makingOffer: false,
      settingRemoteAnswer: false,
      pendingCandidates: [],
      isOnline: false, // Initialize as offline until we receive connection
    };
    this.setupPeerEvents(peer);
    return peer;
  }

  /**
   * Sets up all event handlers for a peer connection
   *
   * This includes handling negotiation events, ICE candidates,
   * connection state changes, and data channels.
   *
   * @param peer - The peer information object
   */
  private setupPeerEvents(peer: PeerInfo) {
    const { id, pc } = peer;

    // We don't set onnegotiationneeded handler here because we're driving
    // negotiation manually with connectTo(). This prevents double offer generation
    // in our tests and ensures consistent behavior.
    pc.onnegotiationneeded = () => {
      console.log("[P2PManager] negotiationneeded event - handled manually");
      // Negotiation driven by explicit connectTo calls
    };

    pc.onconnectionstatechange = () => {
      this.opts.onConnectionState?.(id, pc.connectionState);
    };

    pc.oniceconnectionstatechange = () => {
      // can add extra logging/hook if needed
    };

    pc.onsignalingstatechange = () => {
      // no-op for now, could be surfaced
    };

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        this.signaling.send(id, {
          type: "ice",
          candidate: e.candidate.toJSON(),
        });
      }
    };

    pc.ondatachannel = (ev) => {
      const ch = ev.channel;
      ch.binaryType = "arraybuffer";
      peer.ch = ch;
      this.setupDataChannel(peer);
    };
  }

  /**
   * Sets up all event handlers for a data channel
   *
   * This includes handling message events, open/close events,
   * and error events on the data channel.
   *
   * @param peer - The peer information object with data channel
   */
  private setupDataChannel(peer: PeerInfo) {
    if (!peer.ch) return;

    peer.ch.onmessage = (ev) => {
      try {
        const data = ev.data as ArrayBuffer;

        // Try to parse as JSON message first for control messages (presence, etc)
        try {
          const decoder = new TextDecoder();
          const jsonStr = decoder.decode(data);
          const message = JSON.parse(jsonStr) as P2PMessage;

          // Handle different message types
          if (message.type === MESSAGE_TYPE.PRESENCE) {
            const presenceMsg = message.payload as PresenceMessage;
            this.handlePresenceMessage(peer.id, presenceMsg);
            return; // Don't forward control messages to the application
          }
        } catch (jsonError) {
          // Not a JSON message, treat as regular binary message
        }

        // Forward regular binary messages to the application
        this.opts.onMessage(peer.id, data);
      } catch (e) {
        console.error("[P2PManager] Error in message handler:", e);
      }
    };

    peer.ch.onopen = () => {
      console.log(`[P2PManager] Data channel open with ${peer.id}`);
      this.opts.onDataChannelOpen?.(peer.id);
      this.opts.onConnected?.(peer.id);

      // Send our presence as soon as the channel is open
      this.sendPresenceTo(peer.id, true);
    };

    peer.ch.onclose = () => {
      console.log(`[P2PManager] Data channel closed with ${peer.id}`);
      this.handleDisconnect(peer);
    };

    peer.ch.onerror = (ev) => {
      console.error(`[P2PManager] Data channel error with ${peer.id}:`, ev);
    };
  }

  /**
   * Handles an incoming presence message from a peer
   *
   * @param peerId - The ID of the peer that sent the message
   * @param message - The presence message
   */
  private handlePresenceMessage(peerId: string, message: PresenceMessage) {
    console.log(
      `[P2PManager] Received presence from ${message.userId}: ${
        message.isOnline ? "online" : "offline"
      }`
    );

    const peer = this.peers.get(peerId);
    if (peer) {
      // Update the peer's online status
      peer.isOnline = message.isOnline;

      // Notify callback if provided
      this.opts.onPresenceUpdate?.(peerId, message.isOnline);
    }
  }

  /**
   * Sends a presence update to a specific peer
   *
   * @param peerId - The ID of the peer to send to
   * @param isOnline - Whether this peer is online
   * @returns Whether the message was sent successfully
   */
  sendPresenceTo(peerId: string, isOnline: boolean): boolean {
    const peer = this.peers.get(peerId);
    if (!peer || !peer.ch || peer.ch.readyState !== "open") return false;

    // Create presence message
    const presenceMessage: PresenceMessage = {
      userId: this.myId,
      isOnline,
      timestamp: Date.now(),
    };

    // Wrap in P2P message format
    const message: P2PMessage = {
      type: MESSAGE_TYPE.PRESENCE,
      payload: presenceMessage,
    };

    // Convert to JSON and then to binary
    try {
      const jsonStr = JSON.stringify(message);
      const encoder = new TextEncoder();
      const bytes = encoder.encode(jsonStr).buffer;

      peer.ch.send(bytes);
      return true;
    } catch (e) {
      console.error(`[P2PManager] Failed to send presence to ${peerId}:`, e);
      return false;
    }
  }

  /**
   * Handles disconnection cleanup for a peer
   *
   * Closes all connections, removes the peer from internal maps,
   * and notifies the disconnect listener.
   *
   * @param peer - The peer information object to disconnect
   */
  private handleDisconnect(peer: PeerInfo) {
    const { id, pc } = peer;

    // Close and cleanup resources
    if (peer.ch) {
      peer.ch.close();
    }
    pc.close();
    this.peers.delete(id);

    // Notify listener if provided
    if (this.opts?.onDisconnected) {
      this.opts.onDisconnected(id);
    }
  }

  /**
   * Flushes pending ICE candidates for a peer
   *
   * Applies any pending ICE candidates to the peer connection.
   *
   * @param peer - The peer information object
   */
  private flushPending(peer: PeerInfo) {
    if (peer.pendingCandidates?.length) {
      peer.pendingCandidates.forEach(async (c) => {
        try {
          await peer.pc.addIceCandidate(c);
        } catch {}
      });
      peer.pendingCandidates = [];
    }
  }

  /**
   * Handles incoming WebRTC signaling messages (offers, answers, ICE candidates)
   *
   * This is the core signaling logic for the WebRTC connection lifecycle:
   * - Processes offers and creates answers, handling collisions with Perfect Negotiation pattern
   * - Applies answers to pending offers
   * - Manages ICE candidates (applying or queuing them based on connection state)
   * - Deduplicates messages to prevent duplicate processing
   *
   * @param peer - The PeerInfo object containing connection state for this peer
   * @param fromId - The peer ID that sent the signal
   * @param docId - The document ID used for acknowledgment
   * @param sig - The signaling message received
   */
  private async handleSignal(
    peer: PeerInfo,
    fromId: string,
    docId: string,
    sig: StoredSignal
  ) {
    const { type } = sig;

    try {
      // First acknowledge the message to prevent duplicates
      await this.signaling.ack(docId);

      if (type === "offer" && sig.sdp) {
        await this.handleOfferSignal(peer, fromId, sig);
      } else if (type === "answer" && sig.sdp) {
        await this.handleAnswerSignal(peer, sig);
      } else if (type === "ice" && sig.candidate) {
        await this.handleIceCandidateSignal(peer, sig);
      } else {
        console.warn(`[P2PManager] Ignoring unknown signal type: ${type}`);
      }
    } catch (err) {
      console.error("[P2PManager] Error handling signal:", err);
      // We've already acknowledged the message, so the error is logged but won't
      // cause the message to be reprocessed
    }
  }

  /**
   * Handles incoming WebRTC offer signals
   * Implements Perfect Negotiation pattern for handling offer collisions
   *
   * @param peer - The PeerInfo object for this connection
   * @param fromId - The peer ID that sent the offer
   * @param sig - The offer signal
   */
  private async handleOfferSignal(
    peer: PeerInfo,
    fromId: string,
    sig: StoredSignal
  ) {
    if (!sig.sdp) return;

    // Check if we've already seen this exact offer
    const offerSdp = JSON.stringify(sig.sdp);
    if (peer.lastProcessedOfferSdp === offerSdp) {
      console.log("[P2PManager] Ignoring duplicate offer");
      return;
    }
    peer.lastProcessedOfferSdp = offerSdp;

    // Handle offer collisions (Perfect Negotiation pattern)
    const offerCollision =
      peer.makingOffer || peer.pc.signalingState !== "stable";

    if (offerCollision) {
      if (!peer.polite) {
        console.log("[P2PManager] Ignoring offer collision (impolite peer)");
        return; // ignore impolite collision
      }

      // If we're polite, roll back as needed
      if (peer.pc.signalingState === "have-local-offer") {
        console.log("[P2PManager] Rolling back local offer due to collision");
        try {
          await peer.pc.setLocalDescription({ type: "rollback" } as any);
        } catch (e) {
          console.error("[P2PManager] Error during rollback:", e);
          // Continue despite rollback errors - some browsers handle this differently
        }
      }
      peer.makingOffer = false;
    }

    // Only proceed if in a valid state to set remote description
    if (
      peer.pc.signalingState === "stable" ||
      peer.pc.signalingState === "have-remote-offer"
    ) {
      console.log(
        `[P2PManager] Processing offer in state: ${peer.pc.signalingState}`
      );
      try {
        await peer.pc.setRemoteDescription(sig.sdp);
        this.flushPending(peer);

        // Only create answer if we're now in have-remote-offer state
        if (peer.pc.signalingState === "have-remote-offer") {
          const answer = await peer.pc.createAnswer();
          await peer.pc.setLocalDescription(answer);
          await this.signaling.send(fromId, { type: "answer", sdp: answer });
        }
      } catch (e) {
        console.error("[P2PManager] Error processing offer:", e);
        throw e; // Rethrow to be caught by the outer handler
      }
    } else {
      console.log(
        `[P2PManager] Ignoring offer in invalid state: ${peer.pc.signalingState}`
      );
    }
  }

  /**
   * Handles incoming WebRTC answer signals
   *
   * @param peer - The PeerInfo object for this connection
   * @param sig - The answer signal
   */
  private async handleAnswerSignal(peer: PeerInfo, sig: StoredSignal) {
    if (!sig.sdp) return;

    // Check if we've already seen this exact answer
    const answerSdp = JSON.stringify(sig.sdp);
    if (peer.lastProcessedAnswerSdp === answerSdp) {
      console.log("[P2PManager] Ignoring duplicate answer");
      return;
    }
    peer.lastProcessedAnswerSdp = answerSdp;

    // Only apply answer if we have a local offer pending
    if (peer.pc.signalingState === "have-local-offer") {
      console.log("[P2PManager] Processing answer for our offer");
      try {
        peer.settingRemoteAnswer = true;
        await peer.pc.setRemoteDescription(sig.sdp);
        peer.settingRemoteAnswer = false;
        this.flushPending(peer);
      } catch (e) {
        peer.settingRemoteAnswer = false;
        console.error("[P2PManager] Error processing answer:", e);
        throw e;
      }
    } else {
      console.log(
        `[P2PManager] Ignoring answer in invalid state: ${peer.pc.signalingState}`
      );
    }
  }

  /**
   * Handles incoming ICE candidate signals
   * Either applies them immediately or queues them for later if no remote description is set
   *
   * @param peer - The PeerInfo object for this connection
   * @param sig - The ICE candidate signal
   */
  private async handleIceCandidateSignal(peer: PeerInfo, sig: StoredSignal) {
    if (!sig.candidate) return;

    // Try to add ice candidates if we have a remote description
    if (peer.pc.remoteDescription) {
      console.log("[P2PManager] Adding ICE candidate");
      try {
        await peer.pc.addIceCandidate(sig.candidate);
      } catch (e) {
        // Some ICE candidate errors are non-fatal and expected
        if (peer.pc.signalingState === "stable") {
          // Only log as error when in stable state, otherwise it's likely just a race condition
          console.error("[P2PManager] Error adding ICE candidate:", e);
        } else {
          console.log(
            "[P2PManager] Could not add ICE candidate in state",
            peer.pc.signalingState
          );
        }
      }
    } else {
      console.log("[P2PManager] Storing ICE candidate for later");
      // Initialize the array if needed
      peer.pendingCandidates = peer.pendingCandidates || [];
      peer.pendingCandidates.push(sig.candidate);
    }
  }
}
