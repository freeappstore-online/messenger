import { useMemo, useState } from "react";
import { createP2PManager } from "./p2pManagerFactory";
import type { ISignalingService } from "../services/signalingInterface";

export interface P2POptions {
  onMessage: (bytes: ArrayBuffer) => void;
  onConnectionState?: (peerId: string, state: RTCPeerConnectionState) => void;
  onPresenceUpdate?: (peerId: string, isOnline: boolean) => void;
}

export interface P2PAPI {
  connectTo(peerId: string): Promise<void>;
  disconnectFrom(peerId: string): void;
  send(bytes: ArrayBuffer): void;
  broadcastPresence(isOnline: boolean): void;
  connections: Record<string, RTCPeerConnectionState>;
}

export function useP2P(
  myId: string,
  signaling: ISignalingService | null,
  opts: P2POptions
): P2PAPI {
  const [connections, setConnections] = useState<
    Record<string, RTCPeerConnectionState>
  >({});

  const manager = useMemo(() => {
    if (!signaling) return null;
    return createP2PManager(myId, signaling, {
      onMessage: (_peerId, bytes) => opts.onMessage(bytes),
      onConnectionState: (peerId, state) => {
        setConnections((prev) => ({ ...prev, [peerId]: state }));
        opts.onConnectionState?.(peerId, state);
      },
      onPresenceUpdate: opts.onPresenceUpdate,
    });
  }, [signaling, myId, opts]);

  return {
    async connectTo(peerId) {
      manager?.connectTo(peerId);
    },
    disconnectFrom(peerId) {
      manager?.disconnectFrom(peerId);
    },
    send(bytes) {
      manager?.broadcast(bytes);
    },
    broadcastPresence(isOnline) {
      manager?.broadcastPresence(isOnline);
    },
    connections,
  };
}
