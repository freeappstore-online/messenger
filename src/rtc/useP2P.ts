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
        if (opts.onConnectionState) {
          opts.onConnectionState(peerId, state);
        }
      },
      onPresenceUpdate: opts.onPresenceUpdate
    });
  }, [signaling, myId, opts]);

  return {
    async connectTo(peerId) {
      if (!signaling || !manager) return;
      await manager.connectTo(peerId);
    },
    disconnectFrom(peerId) {
      if (!signaling || !manager) return;
      // Check which method is available and use it appropriately
      if ('disconnectFrom' in manager) {
        (manager as any).disconnectFrom(peerId);
      } else {
        // Use disconnect method from P2PManager2
        (manager as any).disconnect(peerId);
      }
    },
    send(bytes) {
      if (!signaling || !manager) return;
      // Use broadcast to send to all connected peers
      manager.broadcast(bytes);
    },
    broadcastPresence(isOnline) {
      if (!signaling || !manager) return;
      // In our new implementation, we use updatePresence instead of broadcastPresence
      if ('broadcastPresence' in manager) {
        (manager as any).broadcastPresence(isOnline);
      } else {
        // Use updatePresence method from P2PManager2
        (manager as any).updatePresence(isOnline);
      }
    },
    connections
  };
}
