import type { PeerInfo, PresenceMessage } from './p2pUtils';
import type { ISignalingService } from '../services/signalingInterface';
import type { StoredSignal } from "../services/signalingService";

/**
 * Handles an offer signal from a remote peer
 * 
 * @param peer - The peer information
 * @param fromId - The ID of the peer that sent the signal
 * @param sig - The stored signal data
 */
export async function handleOfferSignal(
  peer: PeerInfo,
  fromId: string,
  sig: StoredSignal
): Promise<void> {
  console.log(`[P2PManager] Processing offer from ${fromId}`);

  const pc = peer.pc;
  
  // Ensure this is an offer signal
  if (sig.type !== 'offer' || !sig.sdp) {
    console.log('[P2PManager] Invalid offer signal');
    return;
  }
  
  // Check if we've already processed this exact offer by comparing the SDP string
  const sdpString = JSON.stringify(sig.sdp);
  if (peer.lastProcessedOfferSdp === sdpString) {
    console.log('[P2PManager] Ignoring duplicate offer');
    return;
  }

  // Store the processed SDP as a string for future comparison
  peer.lastProcessedOfferSdp = sdpString;

  try {
    const offerCollision = pc.signalingState !== "stable";
    
    // If polite, rollback if needed; if impolite, ignore the offer
    if (offerCollision) {
      if (!peer.polite) {
        console.log("[P2PManager] Ignoring colliding offer as impolite peer");
        return;
      }
      
      // Polite peer rolls back to stable state before processing offer
      console.log("[P2PManager] Rolling back as polite peer");
      await Promise.all([
        pc.setLocalDescription({ type: "rollback" }),
        pc.setRemoteDescription(sig.sdp)
      ]);
    } else {
      await pc.setRemoteDescription(sig.sdp);
    }
    
    // Create and send our answer
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    console.log(`[P2PManager] Sending answer to ${fromId}`);
    return;
  } catch (e) {
    console.error("[P2PManager] Error handling offer:", e);
  }
}

/**
 * Handles an answer signal from a remote peer
 * 
 * @param fromId - The ID of the peer that sent the signal
 * @param sig - The stored signal data
 * @param peer - The peer information
 * @param signaling - The signaling service
 */
export async function handleAnswerSignal(
  fromId: string, 
  sig: StoredSignal, 
  peer: PeerInfo, 
  _signaling: ISignalingService // Renamed with underscore to indicate it's not used
): Promise<void> {
  console.log(`[P2PManager] Processing answer from ${fromId}`);

  const pc = peer.pc;
  
  // Ensure this is an answer signal
  if (sig.type !== 'answer' || !sig.sdp) {
    console.log('[P2PManager] Invalid answer signal');
    return;
  }
  
  // Check if we've already processed this exact answer by comparing SDP string
  const sdpString = JSON.stringify(sig.sdp);
  if (peer.lastProcessedAnswerSdp === sdpString) {
    console.log('[P2PManager] Ignoring duplicate answer');
    return;
  }

  // Store the processed SDP as a string for future comparison
  peer.lastProcessedAnswerSdp = sdpString;

  try {
    // Mark that we're setting a remote answer to handle glare
    peer.settingRemoteAnswer = true;
    await pc.setRemoteDescription(sig.sdp);
  } catch (e) {
    console.error("[P2PManager] Error handling answer:", e);
  } finally {
    peer.settingRemoteAnswer = false;
  }
  
  // Process any queued ICE candidates
  if (peer.pendingCandidates && peer.pendingCandidates.length > 0) {
    console.log(`[P2PManager] Processing ${peer.pendingCandidates.length} queued ICE candidates`);
    for (const candidate of peer.pendingCandidates) {
      try {
        await pc.addIceCandidate(candidate);
      } catch (e) {
        console.error("[P2PManager] Error adding queued ICE candidate:", e);
      }
    }
    peer.pendingCandidates = [];
  }
}

/**
 * Handles an ICE candidate signal from a remote peer
 * 
 * @param peer - The peer information
 * @param sig - The stored signal data
 */
export async function handleIceCandidateSignal(
  peer: PeerInfo, 
  sig: StoredSignal
): Promise<void> {
  const pc = peer.pc;
  
  // Only process ICE candidates if we have a remote description
  if (pc.remoteDescription && pc.remoteDescription.type) {
    console.log("[P2PManager] Processing ICE candidate");
    try {
      await pc.addIceCandidate(sig.candidate!);
    } catch (e) {
      if (pc.signalingState === "stable") {
        // Only log as error when in stable state, otherwise it's likely just a race condition
        console.error("[P2PManager] Error adding ICE candidate:", e);
      } else {
        console.log(
          "[P2PManager] Could not add ICE candidate in state",
          pc.signalingState
        );
      }
    }
  } else {
    console.log("[P2PManager] Storing ICE candidate for later");
    // Initialize the array if needed
    peer.pendingCandidates = peer.pendingCandidates || [];
    peer.pendingCandidates.push(sig.candidate!);
  }
}

/**
 * Handles a presence message from a remote peer
 * 
 * @param peerId - The ID of the peer that sent the message
 * @param message - The presence message
 * @param onPresenceUpdate - Callback for presence updates
 */
export function handlePresenceMessage(
  peerId: string, 
  message: PresenceMessage,
  onPresenceUpdate?: (peerId: string, isOnline: boolean) => void
): void {
  console.log(
    `[P2PManager] Received presence from ${message.userId}: ${
      message.isOnline ? "online" : "offline"
    }`
  );

  // Get all connections for this peer
  onPresenceUpdate?.(peerId, message.isOnline);
}
