import type { StoredSignal } from "../services/signalingService";
import type { PeerInfo } from "./p2pUtils";
import type { SignalHandlerContext } from "./types";

export async function handleSignal(
  context: SignalHandlerContext,
  fromId: string,
  signal: StoredSignal
): Promise<void> {
  if (!signal || !signal.type) {
    console.warn("Received invalid signal:", signal);
    return;
  }

  try {
    await context.signaling.ack(fromId);
  } catch (error) {
    console.error("Error acknowledging signal:", error);
  }

  const peer = context.peers.get(fromId);
  if (!peer) {
    console.warn(`Received signal from unknown peer: ${fromId}`);
    return;
  }

  console.log(`Received ${signal.type} signal from ${fromId}`);

  try {
    switch (signal.type) {
      case "offer":
        await handleOfferSignal(context, fromId, peer, signal);
        break;
      case "answer":
        await handleAnswerSignal(context, fromId, peer, signal);
        break;
      case "ice":
        await handleIceCandidateSignal(peer, signal);
        break;
      default:
        console.warn(`Unknown signal type: ${signal.type}`);
    }
  } catch (error) {
    console.error(`Error processing ${signal.type} from ${fromId}:`, error);
  }
}

async function handleOfferSignal(
  context: SignalHandlerContext,
  fromId: string,
  peer: PeerInfo,
  signal: StoredSignal
): Promise<void> {
  if (!signal.sdp) return;

  const offerSdp = JSON.stringify(signal.sdp);
  if (peer.lastProcessedOfferSdp === offerSdp) {
    console.log("[P2PManager] Ignoring duplicate offer");
    return;
  }
  peer.lastProcessedOfferSdp = offerSdp;

  const offerCollision = peer.pc.signalingState !== "stable";

  if (offerCollision) {
    if (!peer.polite) {
      console.log("[P2PManager] Ignoring colliding offer as impolite peer");
      return;
    }
    if (peer.pc.signalingState === "have-local-offer") {
      console.log("[P2PManager] Rolling back local offer due to collision");
      await peer.pc.setLocalDescription({ type: "rollback" });
    }
  }

  await peer.pc.setRemoteDescription(signal.sdp);

  if (peer.pc.signalingState === "have-remote-offer") {
    const answer = await peer.pc.createAnswer();
    await peer.pc.setLocalDescription(answer);
    const localDesc = peer.pc.localDescription;
    if (localDesc) {
      context.sendSignalingMessage(fromId, {
        type: "answer",
        sdp: localDesc,
      });
    }
  }

  context.flushPendingIceCandidates(fromId, peer.pc);
}

async function handleAnswerSignal(
  context: SignalHandlerContext,
  fromId: string,
  peer: PeerInfo,
  signal: StoredSignal
): Promise<void> {
  if (!signal.sdp) return;

  const answerSdp = JSON.stringify(signal.sdp);
  if (peer.lastProcessedAnswerSdp === answerSdp) {
    console.log("[P2PManager] Ignoring duplicate answer");
    return;
  }
  peer.lastProcessedAnswerSdp = answerSdp;

  peer.settingRemoteAnswer = true;

  if (peer.pc.signalingState === "have-local-offer") {
    await peer.pc.setRemoteDescription(signal.sdp);
  } else {
    console.log(
      `[P2PManager] Cannot apply answer in current state: ${peer.pc.signalingState}`
    );
  }

  peer.settingRemoteAnswer = false;
  context.flushPendingIceCandidates(fromId, peer.pc);
}

async function handleIceCandidateSignal(
  peer: PeerInfo,
  signal: StoredSignal
): Promise<void> {
  if (!signal.candidate) return;

  try {
    if (peer.pc.remoteDescription && peer.pc.remoteDescription.type) {
      await peer.pc.addIceCandidate(signal.candidate);
    } else {
      peer.pendingCandidates = peer.pendingCandidates || [];
      peer.pendingCandidates.push(signal.candidate);
      console.log(
        `[P2PManager] Stored ICE candidate for later (no remote description yet)`
      );
    }
  } catch (error) {
    console.error("[P2PManager] Error adding ICE candidate:", error);
  }
}
