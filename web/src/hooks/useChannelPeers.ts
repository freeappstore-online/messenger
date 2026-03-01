import { useEffect, useRef, useCallback, useState } from 'react';
import type { WsClient } from '../services/wsClient';
import type { P2PMessage, SignalPayload } from '@famchat/shared';

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

type P2PHandler = (peerId: string, msg: P2PMessage) => void;

interface PeerConn {
  pc: RTCPeerConnection;
  dc: RTCDataChannel | null;
  open: boolean;
}

export function useChannelPeers(
  currentUserId: string | undefined,
  wsClient: WsClient,
  peerIds: string[],
) {
  const [connectedPeerIds, setConnectedPeerIds] = useState<string[]>([]);
  const peersRef = useRef<Map<string, PeerConn>>(new Map());
  const handlersRef = useRef<Set<P2PHandler>>(new Set());

  const connectionId = useCallback(
    (peerId: string) => `ch-${[currentUserId, peerId].sort().join('-')}`,
    [currentUserId],
  );

  const sendSignal = useCallback(
    (peerId: string, payload: SignalPayload) => {
      wsClient.send({ type: 'signal', to: peerId, payload });
    },
    [wsClient],
  );

  const updateConnected = useCallback(() => {
    const ids: string[] = [];
    for (const [id, conn] of peersRef.current) {
      if (conn.open) ids.push(id);
    }
    setConnectedPeerIds(ids);
  }, []);

  const setupDC = useCallback(
    (peerId: string, dc: RTCDataChannel) => {
      const peer = peersRef.current.get(peerId);
      if (peer) peer.dc = dc;

      dc.onopen = () => {
        console.log('[P2P-DC] open', peerId);
        if (peer) peer.open = true;
        updateConnected();
      };
      dc.onclose = () => {
        console.log('[P2P-DC] close', peerId);
        if (peer) peer.open = false;
        updateConnected();
      };
      dc.onerror = (e) => console.error('[P2P-DC] error', peerId, e);
      dc.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data) as P2PMessage;
          for (const h of handlersRef.current) h(peerId, msg);
        } catch { /* ignore malformed */ }
      };
    },
    [updateConnected],
  );

  // Connect to each peer
  useEffect(() => {
    if (!currentUserId) return;

    const activePeers = new Set(peerIds);
    const peers = peersRef.current;

    // Remove peers no longer in list
    for (const [id, conn] of peers) {
      if (!activePeers.has(id)) {
        conn.dc?.close();
        conn.pc.close();
        peers.delete(id);
      }
    }

    // Create connections for new peers
    for (const peerId of peerIds) {
      if (peers.has(peerId)) continue;

      const connId = connectionId(peerId);
      const isOfferer = currentUserId < peerId;
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      const peerConn: PeerConn = { pc, dc: null, open: false };
      peers.set(peerId, peerConn);

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          sendSignal(peerId, { type: 'dc-ice', candidate: e.candidate.toJSON(), connectionId: connId });
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          peerConn.open = false;
          peerConn.dc?.close();
          peerConn.dc = null;
          updateConnected();
        }
      };

      if (isOfferer) {
        const dc = pc.createDataChannel('p2p-channel');
        setupDC(peerId, dc);
      } else {
        pc.ondatachannel = (e) => setupDC(peerId, e.channel);
      }

      // Send dc-ready to initiate
      sendSignal(peerId, { type: 'dc-ready', connectionId: connId });
    }

    updateConnected();
  }, [currentUserId, peerIds, connectionId, sendSignal, setupDC, updateConnected]);

  // Listen for signaling messages
  useEffect(() => {
    if (!currentUserId) return;

    return wsClient.onMessage((msg) => {
      if (msg.type !== 'signal') return;
      const { from, payload } = msg;

      // Only handle dc-signals with our connectionId prefix
      if (!('connectionId' in payload) || !payload.connectionId?.startsWith('ch-')) return;

      const expectedConnId = connectionId(from);
      if (payload.connectionId !== expectedConnId) return;

      const peer = peersRef.current.get(from);
      if (!peer) return;

      const { pc } = peer;
      const isOfferer = currentUserId < from;

      if (payload.type === 'dc-ready') {
        if (isOfferer) {
          pc.createOffer()
            .then((offer) => pc.setLocalDescription(offer))
            .then(() => {
              sendSignal(from, {
                type: 'dc-offer',
                sdp: pc.localDescription!,
                connectionId: expectedConnId,
              });
            })
            .catch((err) => console.error('[P2P-DC] offer error', err));
        } else {
          sendSignal(from, { type: 'dc-ready', connectionId: expectedConnId });
        }
        return;
      }

      if (payload.type === 'dc-offer') {
        pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
          .then(() => pc.createAnswer())
          .then((answer) => pc.setLocalDescription(answer))
          .then(() => {
            sendSignal(from, {
              type: 'dc-answer',
              sdp: pc.localDescription!,
              connectionId: expectedConnId,
            });
          })
          .catch((err) => console.error('[P2P-DC] answer error', err));
        return;
      }

      if (payload.type === 'dc-answer') {
        pc.setRemoteDescription(new RTCSessionDescription(payload.sdp)).catch(console.error);
        return;
      }

      if (payload.type === 'dc-ice') {
        pc.addIceCandidate(new RTCIceCandidate(payload.candidate)).catch(console.error);
      }
    });
  }, [currentUserId, wsClient, connectionId, sendSignal]);

  // Cleanup all on unmount
  useEffect(() => {
    return () => {
      for (const [, conn] of peersRef.current) {
        conn.dc?.close();
        conn.pc.close();
      }
      peersRef.current.clear();
    };
  }, []);

  const sendToPeer = useCallback((peerId: string, msg: P2PMessage) => {
    const peer = peersRef.current.get(peerId);
    if (peer?.dc?.readyState === 'open') {
      peer.dc.send(JSON.stringify(msg));
    }
  }, []);

  const broadcastP2P = useCallback((msg: P2PMessage) => {
    const data = JSON.stringify(msg);
    for (const [, conn] of peersRef.current) {
      if (conn.dc?.readyState === 'open') {
        conn.dc.send(data);
      }
    }
  }, []);

  const onP2PMessage = useCallback((handler: P2PHandler): (() => void) => {
    handlersRef.current.add(handler);
    return () => handlersRef.current.delete(handler);
  }, []);

  return { sendToPeer, broadcastP2P, connectedPeerIds, onP2PMessage };
}
