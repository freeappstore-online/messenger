import type { ISignalingService } from "../services/signalingInterface";
import { P2PManager } from "./p2pManager2";
import type { P2PManagerOptions } from "./p2pUtils";
import { SimplePeerManager } from "./simplePeerManager";

// Feature flag to control which implementation to use
export const USE_SIMPLE_PEER = false; // Set to false to use native WebRTC implementation

/**
 * Factory function to create the appropriate P2P manager implementation
 * based on the feature flag.
 */
export function createP2PManager(
  myId: string,
  signaling: ISignalingService,
  opts: P2PManagerOptions
): P2PManager | SimplePeerManager {
  if (USE_SIMPLE_PEER) {
    console.log("Using SimplePeerManager implementation");
    return new SimplePeerManager(myId, signaling, opts);
  } else {
    console.log("Using raw WebRTC P2PManager implementation");
    // P2PManager constructor takes: id, displayName, signaling, options
    // Use myId as the displayName
    
    // Extract the iceServers from options
    const iceServers = opts.iceServers || [{urls: 'stun:stun.l.google.com:19302'}];
    
    return new P2PManager(myId, myId, signaling, { iceServers });
  }
}
