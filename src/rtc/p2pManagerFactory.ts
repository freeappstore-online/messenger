import type { ISignalingService } from "../services/signalingInterface";
import { P2PManager } from "./p2pManager2";
import type { P2PManagerOptions } from "./p2pUtils";
import { SimplePeerManager } from "./simplePeerManager";

// Feature flag to control which implementation to use
export const USE_SIMPLE_PEER = false;

export function createP2PManager(
  myId: string,
  signaling: ISignalingService,
  _opts: P2PManagerOptions
): P2PManager | SimplePeerManager {
  if (USE_SIMPLE_PEER) {
    console.log("Using SimplePeerManager implementation");
    return new SimplePeerManager(myId, signaling, _opts);
  } else {
    console.log("Using raw WebRTC P2PManager implementation");
    return new P2PManager(myId, signaling);
  }
}
