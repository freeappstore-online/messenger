import { useEffect, useRef, useCallback, useState } from 'react';
import type { WsClient } from '../services/wsClient';
import type { P2PMessage, SignalPayload } from '@famchat/shared';
import {
  decryptFromPeer,
  encryptForPeer,
  getIdentityPublicJwk,
  isEncryptedPayload,
  rememberPeerPublicKey,
} from '../crypto/e2ee';

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];
const PAYLOAD_CHUNK_SIZE = 12 * 1024;

type P2PHandler = (peerId: string, msg: P2PMessage) => void;

interface PeerConn {
  pc: RTCPeerConnection;
  dc: RTCDataChannel | null;
  open: boolean;
}

type DCPacket =
  | { type: 'p2p-message'; message: P2PMessage }
  | { type: 'p2p-chunk-start'; transferId: string; totalChunks: number }
  | { type: 'p2p-chunk'; transferId: string; index: number; chunk: string }
  | { type: 'p2p-chunk-complete'; transferId: string };

interface IncomingTransfer {
  totalChunks: number;
  chunks: string[];
}

interface EncryptedWirePacket {
  type: 'e2ee';
  payload: {
    v: 1;
    iv: string;
    ct: string;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isEncryptedWirePacket(value: unknown): value is EncryptedWirePacket {
  if (!isRecord(value)) return false;
  return value.type === 'e2ee' && isEncryptedPayload(value.payload);
}

function isP2PMessage(value: unknown): value is P2PMessage {
  if (!isRecord(value) || typeof value.type !== 'string') return false;
  if (value.type === 'p2p-channel-post') {
    return typeof value.channelId === 'string' && isRecord(value.post);
  }
  if (value.type === 'p2p-channel-sync-request') {
    return typeof value.channelId === 'string'
      && (value.sinceTimestamp === undefined || typeof value.sinceTimestamp === 'number');
  }
  if (value.type === 'p2p-channel-sync-response') {
    return typeof value.channelId === 'string' && Array.isArray(value.posts);
  }
  return false;
}

export function useChannelPeers(
  currentUserId: string | undefined,
  wsClient: WsClient,
  peerIds: string[],
) {
  const [connectedPeerIds, setConnectedPeerIds] = useState<string[]>([]);
  const peersRef = useRef<Map<string, PeerConn>>(new Map());
  const handlersRef = useRef<Set<P2PHandler>>(new Set());
  const incomingTransfersRef = useRef<Map<string, IncomingTransfer>>(new Map());

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

  const sendIdentityKey = useCallback((peerId: string) => {
    getIdentityPublicJwk()
      .then((publicKey) => {
        sendSignal(peerId, { type: 'e2ee-key', publicKey: publicKey as Record<string, unknown> });
      })
      .catch((err) => {
        console.error('[E2EE] failed to send identity key', err);
      });
  }, [sendSignal]);

  const updateConnected = useCallback(() => {
    const ids: string[] = [];
    for (const [id, conn] of peersRef.current) {
      if (conn.open) ids.push(id);
    }
    ids.sort();
    setConnectedPeerIds((prev) => {
      if (prev.length === ids.length && prev.every((id, idx) => id === ids[idx])) return prev;
      return ids;
    });
  }, []);

  const setupDC = useCallback(
    (peerId: string, dc: RTCDataChannel) => {
      const peer = peersRef.current.get(peerId);
      if (peer) peer.dc = dc;

      dc.onopen = () => {
        if (peer) peer.open = true;
        updateConnected();
      };
      dc.onclose = () => {
        if (peer) peer.open = false;
        updateConnected();
      };
      dc.onerror = (e) => console.error('[P2P-DC] error', peerId, e);
      dc.onmessage = (e) => {
        void (async () => {
          try {
            if (typeof e.data !== 'string') return;
            const parsed: unknown = JSON.parse(e.data);

            let decoded: unknown = parsed;
            if (isEncryptedWirePacket(parsed)) {
              const plaintext = await decryptFromPeer(peerId, parsed.payload);
              if (!plaintext) return;
              decoded = JSON.parse(plaintext);
            }

            if (isP2PMessage(decoded)) {
              for (const h of handlersRef.current) h(peerId, decoded);
              return;
            }
            if (!isRecord(decoded) || typeof decoded.type !== 'string') return;
            const packet = decoded as DCPacket;

            if (packet.type === 'p2p-message') {
              if (!isP2PMessage(packet.message)) return;
              for (const h of handlersRef.current) h(peerId, packet.message);
              return;
            }

            if (packet.type === 'p2p-chunk-start') {
              incomingTransfersRef.current.set(`${peerId}:${packet.transferId}`, {
                totalChunks: packet.totalChunks,
                chunks: Array<string>(packet.totalChunks).fill(''),
              });
              return;
            }

            if (packet.type === 'p2p-chunk') {
              const key = `${peerId}:${packet.transferId}`;
              const transfer = incomingTransfersRef.current.get(key);
              if (!transfer) return;
              if (packet.index < 0 || packet.index >= transfer.totalChunks) return;
              transfer.chunks[packet.index] = packet.chunk;
              return;
            }

            if (packet.type === 'p2p-chunk-complete') {
              const key = `${peerId}:${packet.transferId}`;
              const transfer = incomingTransfersRef.current.get(key);
              if (!transfer) return;
              incomingTransfersRef.current.delete(key);
              if (transfer.chunks.some((chunk) => chunk.length === 0)) {
                console.warn('[P2P-DC] incomplete chunked payload', packet.transferId);
                return;
              }
              const payloadText = transfer.chunks.join('');
              const payload: unknown = JSON.parse(payloadText);
              if (!isP2PMessage(payload)) return;
              for (const h of handlersRef.current) h(peerId, payload);
            }
          } catch {
            // Ignore malformed packets.
          }
        })();
      };
    },
    [updateConnected],
  );

  // Connect to each peer
  useEffect(() => {
    if (!currentUserId) return;

    const activePeers = new Set(peerIds);
    const peers = peersRef.current;

    for (const [id, conn] of peers) {
      if (!activePeers.has(id)) {
        conn.dc?.close();
        conn.pc.close();
        peers.delete(id);
      }
    }

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

      sendSignal(peerId, { type: 'dc-ready', connectionId: connId });
      sendIdentityKey(peerId);
    }

    updateConnected();
  }, [currentUserId, peerIds, connectionId, sendSignal, sendIdentityKey, setupDC, updateConnected]);

  // Re-announce after WS reconnect.
  useEffect(() => {
    if (!currentUserId) return;
    const announce = () => {
      for (const peerId of peerIds) {
        sendSignal(peerId, { type: 'dc-ready', connectionId: connectionId(peerId) });
        sendIdentityKey(peerId);
      }
    };
    if (wsClient.connected) announce();
    return wsClient.onConnect(announce);
  }, [currentUserId, peerIds, wsClient, connectionId, sendSignal, sendIdentityKey]);

  // Listen for signaling messages
  useEffect(() => {
    if (!currentUserId) return;

    return wsClient.onMessage((msg) => {
      if (msg.type !== 'signal') return;
      const { from, payload } = msg;

      if (payload.type === 'e2ee-key') {
        if (isRecord(payload.publicKey)) {
          rememberPeerPublicKey(from, payload.publicKey).catch((err) => {
            console.error('[E2EE] failed to store peer key', err);
          });
        }
        return;
      }

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
          sendIdentityKey(from);
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
  }, [currentUserId, wsClient, connectionId, sendSignal, sendIdentityKey]);

  useEffect(() => {
    const peers = peersRef.current;
    const incomingTransfers = incomingTransfersRef.current;
    return () => {
      for (const [, conn] of peers) {
        conn.dc?.close();
        conn.pc.close();
      }
      peers.clear();
      incomingTransfers.clear();
    };
  }, []);

  const sendEncodedToPeer = useCallback(async (peerId: string, data: string): Promise<boolean> => {
    const peer = peersRef.current.get(peerId);
    if (peer?.dc?.readyState !== 'open') return false;
    const envelope = await encryptForPeer(peerId, data);
    if (!envelope) return false;
    peer.dc.send(JSON.stringify({ type: 'e2ee', payload: envelope }));
    return true;
  }, []);

  const sendMessageToPeer = useCallback(async (peerId: string, msg: P2PMessage): Promise<boolean> => {
    const encoded = JSON.stringify(msg);
    if (encoded.length <= PAYLOAD_CHUNK_SIZE) {
      return sendEncodedToPeer(peerId, encoded);
    }

    const chunks = encoded.match(new RegExp(`.{1,${PAYLOAD_CHUNK_SIZE}}`, 'g')) ?? [''];
    const transferId = `${peerId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const startPacket: DCPacket = {
      type: 'p2p-chunk-start',
      transferId,
      totalChunks: chunks.length,
    };
    if (!await sendEncodedToPeer(peerId, JSON.stringify(startPacket))) return false;

    for (let i = 0; i < chunks.length; i++) {
      const chunkPacket: DCPacket = {
        type: 'p2p-chunk',
        transferId,
        index: i,
        chunk: chunks[i],
      };
      if (!await sendEncodedToPeer(peerId, JSON.stringify(chunkPacket))) return false;
    }

    const completePacket: DCPacket = { type: 'p2p-chunk-complete', transferId };
    return sendEncodedToPeer(peerId, JSON.stringify(completePacket));
  }, [sendEncodedToPeer]);

  const sendToPeer = useCallback((peerId: string, msg: P2PMessage): Promise<boolean> => {
    return sendMessageToPeer(peerId, msg);
  }, [sendMessageToPeer]);

  const broadcastP2P = useCallback(async (msg: P2PMessage): Promise<void> => {
    for (const [peerId] of peersRef.current) {
      await sendMessageToPeer(peerId, msg);
    }
  }, [sendMessageToPeer]);

  const onP2PMessage = useCallback((handler: P2PHandler): (() => void) => {
    handlersRef.current.add(handler);
    return () => handlersRef.current.delete(handler);
  }, []);

  return { sendToPeer, broadcastP2P, connectedPeerIds, onP2PMessage };
}
