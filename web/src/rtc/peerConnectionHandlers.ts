import type { PeerInfo } from './p2pUtils';
import type { P2PManagerOptions } from './p2pUtils';
import { setupDataChannel } from './dataChannelHandlers';

/**
 * Creates a new peer connection
 * 
 * @param myId - The ID of this peer
 * @param peerId - The ID of the remote peer
 * @param connectionId - Unique ID for this connection
 * @param connectionType - Whether this was automatically or manually initiated
 * @param options - Options for the P2PManager instance
 * @returns A new peer connection object
 */
export function createPeer(
  _myId: string,
  peerId: string, 
  connectionId: string, 
  connectionType: 'auto' | 'manual' = 'auto',
  options: P2PManagerOptions
): PeerInfo {
  console.log(`[P2PManager] Creating new peer for ${peerId} with ID ${connectionId}`);
  
  // The first character of our IDs determines politeness
  // This ensures consistent behavior when both peers create connections simultaneously
  const polite = _myId < peerId;
  
  // Create the WebRTC peer connection
  const pc = new RTCPeerConnection({
    iceServers: options.iceServers || [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ],
  });
  
  // Create the peer info object
  const peer: PeerInfo = {
    id: peerId,
    connectionId,
    connectionType,
    pc,
    makingOffer: false,
    settingRemoteAnswer: false,
    polite,
    isOnline: false,
  };
  
  // Set up the peer events
  setupPeerEvents(peer, _myId, options);
  
  return peer;
}

/**
 * Sets up event handlers for a peer connection
 * 
 * @param peer - The peer connection info
 * @param myId - The ID of this peer
 * @param options - Options for the P2PManager instance
 */
export function setupPeerEvents(peer: PeerInfo, _myId: string, options: P2PManagerOptions): void {
  const pc = peer.pc;
  const peerId = peer.id;
  
  // Handle connection state changes
  pc.onconnectionstatechange = () => {
    console.log(`[P2PManager] Connection state for ${peerId}: ${pc.connectionState}`);
    
    // Notify the app of connection state changes
    options.onConnectionState?.(peerId, pc.connectionState);
    
    // Handle connected and disconnected states
    if (pc.connectionState === "connected") {
      options.onConnected?.(peerId);
    } else if (pc.connectionState === "disconnected" || 
               pc.connectionState === "failed" || 
               pc.connectionState === "closed") {
      options.onDisconnected?.(peerId);
    }
  };

  // Handle ICE connection state changes
  pc.oniceconnectionstatechange = () => {
    console.log(`[P2PManager] ICE state for ${peerId}: ${pc.iceConnectionState}`);
  };
  
  // Handle ICE gathering state changes
  pc.onicegatheringstatechange = () => {
    console.log(`[P2PManager] ICE gathering state for ${peerId}: ${pc.iceGatheringState}`);
  };
  
  // Handle ICE candidate generation
  pc.onicecandidate = async (ev) => {
    if (!ev.candidate) return;
    
    try {
      // Send the ICE candidate to the remote peer
      console.log(`[P2PManager] Sending ICE candidate to ${peerId}`);
      // This would need to be handled by the main P2PManager class
      // signaling.send(peerId, {
      //   type: "ice",
      //   from: myId,
      //   connectionId: peer.connectionId,
      //   candidate: ev.candidate.toJSON(),
      // });
    } catch (e) {
      console.error("[P2PManager] Error sending ICE candidate:", e);
    }
  };
  
  // Handle negotiation needed events
  pc.onnegotiationneeded = async () => {
    try {
      // Don't create offers if we're already in the process
      if (peer.makingOffer) {
        console.log("[P2PManager] Already making offer, skipping");
        return;
      }
      
      peer.makingOffer = true;
      console.log(`[P2PManager] Creating offer for ${peerId}`);
      
      // Create an offer
      await pc.setLocalDescription();
      
      // Send the offer to the remote peer
      // This would need to be handled by the main P2PManager class
      // signaling.send(peerId, {
      //   type: "offer",
      //   from: myId,
      //   connectionId: peer.connectionId,
      //   offer: pc.localDescription?.toJSON(),
      // });
    } catch (e) {
      console.error("[P2PManager] Error creating offer:", e);
    } finally {
      peer.makingOffer = false;
    }
  };
  
  // Create and set up the data channel
  try {
    const channel = pc.createDataChannel("data");
    channel.binaryType = "arraybuffer";
    peer.ch = channel;
    setupDataChannel(peer, options.onMessage, options.onPresenceUpdate);
  } catch (e) {
    console.error("[P2PManager] Error creating data channel:", e);
  }
  
  // Handle data channels created by the remote peer
  pc.ondatachannel = (ev) => {
    const ch = ev.channel;
    ch.binaryType = "arraybuffer";
    peer.ch = ch;
    setupDataChannel(peer, options.onMessage, options.onPresenceUpdate);
  };
}
