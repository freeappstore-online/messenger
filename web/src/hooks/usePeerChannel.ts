import { useState, useEffect, useRef, useCallback } from 'react';
import type { WsClient } from '../services/wsClient';
import type { MessageAttachment, PlainMessage, SignalPayload } from '@famchat/shared';
import { getPendingDirectMessagesForPeer, removePendingDirectMessage } from '../chat/db';
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
const IMAGE_CHUNK_SIZE = 12 * 1024;

type BaseMessage = Omit<PlainMessage, 'attachments'>;
type AttachmentMeta = Omit<MessageAttachment, 'dataUrl'> & { dataUrlPrefix: string };

type DCPacket =
  | { type: 'chat-message'; message: PlainMessage }
  | { type: 'chat-image-start'; transferId: string; message: BaseMessage; attachment: AttachmentMeta; totalChunks: number }
  | { type: 'chat-image-chunk'; transferId: string; index: number; chunk: string }
  | { type: 'chat-image-complete'; transferId: string };

interface IncomingImageTransfer {
  message: BaseMessage;
  attachment: AttachmentMeta;
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

function isPlainMessage(value: unknown): value is PlainMessage {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string'
    && typeof value.authorId === 'string'
    && typeof value.authorName === 'string'
    && typeof value.convId === 'string'
    && typeof value.body === 'string'
    && typeof value.createdAt === 'number';
}

function isEncryptedWirePacket(value: unknown): value is EncryptedWirePacket {
  if (!isRecord(value)) return false;
  return value.type === 'e2ee' && isEncryptedPayload(value.payload);
}

export function usePeerChannel(
  peerId: string | undefined,
  currentUserId: string,
  wsClient: WsClient,
  onReceive: (msg: PlainMessage) => void,
) {
  const [isOpen, setIsOpen] = useState(false);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const incomingTransfersRef = useRef<Map<string, IncomingImageTransfer>>(new Map());
  const onReceiveRef = useRef(onReceive);
  onReceiveRef.current = onReceive;

  const isOfferer = peerId ? currentUserId < peerId : false;

  const sendSignal = useCallback(
    (payload: SignalPayload) => {
      if (peerId) wsClient.send({ type: 'signal', to: peerId, payload });
    },
    [peerId, wsClient],
  );

  const sendIdentityKey = useCallback(() => {
    if (!peerId) return;
    getIdentityPublicJwk()
      .then((publicKey) => {
        sendSignal({ type: 'e2ee-key', publicKey: publicKey as Record<string, unknown> });
      })
      .catch((err) => {
        console.error('[E2EE] failed to send identity key', err);
      });
  }, [peerId, sendSignal]);

  const handlePacket = useCallback((packet: DCPacket) => {
    if (packet.type === 'chat-message') {
      onReceiveRef.current(packet.message);
      return;
    }

    if (packet.type === 'chat-image-start') {
      incomingTransfersRef.current.set(packet.transferId, {
        message: packet.message,
        attachment: packet.attachment,
        totalChunks: packet.totalChunks,
        chunks: Array<string>(packet.totalChunks).fill(''),
      });
      return;
    }

    if (packet.type === 'chat-image-chunk') {
      const transfer = incomingTransfersRef.current.get(packet.transferId);
      if (!transfer) return;
      if (packet.index < 0 || packet.index >= transfer.totalChunks) return;
      transfer.chunks[packet.index] = packet.chunk;
      return;
    }

    if (packet.type === 'chat-image-complete') {
      const transfer = incomingTransfersRef.current.get(packet.transferId);
      if (!transfer) return;
      incomingTransfersRef.current.delete(packet.transferId);
      if (transfer.chunks.some((chunk) => chunk.length === 0)) {
        console.warn('[DC] image transfer incomplete', packet.transferId);
        return;
      }
      const attachment: MessageAttachment = {
        id: transfer.attachment.id,
        kind: 'image',
        mimeType: transfer.attachment.mimeType,
        fileName: transfer.attachment.fileName,
        size: transfer.attachment.size,
        dataUrl: transfer.attachment.dataUrlPrefix + transfer.chunks.join(''),
      };
      onReceiveRef.current({ ...transfer.message, attachments: [attachment] });
    }
  }, []);

  const setupDC = useCallback((dc: RTCDataChannel) => {
    dcRef.current = dc;
    dc.onopen = () => { setIsOpen(true); };
    dc.onclose = () => { setIsOpen(false); };
    dc.onerror = (e) => console.error('[DC] error', e);
    dc.onmessage = (e) => {
      void (async () => {
        try {
          if (typeof e.data !== 'string') return;
          const parsed: unknown = JSON.parse(e.data);

          let decoded: unknown = parsed;
          if (peerId && isEncryptedWirePacket(parsed)) {
            const plaintext = await decryptFromPeer(peerId, parsed.payload);
            if (!plaintext) return;
            decoded = JSON.parse(plaintext);
          }

          // Backward compatibility for old clients.
          if (isPlainMessage(decoded)) {
            onReceiveRef.current(decoded);
            return;
          }

          if (!isRecord(decoded) || typeof decoded.type !== 'string') return;
          handlePacket(decoded as DCPacket);
        } catch {
          // Ignore malformed packets.
        }
      })();
    };
  }, [handlePacket, peerId]);

  const sendPacket = useCallback(async (packet: DCPacket): Promise<boolean> => {
    const dc = dcRef.current;
    if (!dc || dc.readyState !== 'open' || !peerId) return false;
    const envelope = await encryptForPeer(peerId, JSON.stringify(packet));
    if (!envelope) return false;
    dc.send(JSON.stringify({ type: 'e2ee', payload: envelope }));
    return true;
  }, [peerId]);

  const send = useCallback(async (msg: PlainMessage): Promise<boolean> => {
    const dc = dcRef.current;
    if (!dc || dc.readyState !== 'open') return false;

    const image = msg.attachments?.find((attachment) => attachment.kind === 'image');
    if (!image) {
      return sendPacket({ type: 'chat-message', message: msg });
    }

    const commaIndex = image.dataUrl.indexOf(',');
    if (commaIndex < 0) {
      return sendPacket({ type: 'chat-message', message: msg });
    }

    const dataUrlPrefix = image.dataUrl.slice(0, commaIndex + 1);
    const payload = image.dataUrl.slice(commaIndex + 1);
    const chunks = payload.match(new RegExp(`.{1,${IMAGE_CHUNK_SIZE}}`, 'g')) ?? [''];
    const transferId = `${msg.id}-${image.id}`;

    const baseMessage: BaseMessage = {
      id: msg.id,
      authorId: msg.authorId,
      authorName: msg.authorName,
      convId: msg.convId,
      body: msg.body,
      createdAt: msg.createdAt,
    };

    const started = await sendPacket({
      type: 'chat-image-start',
      transferId,
      message: baseMessage,
      attachment: {
        id: image.id,
        kind: 'image',
        mimeType: image.mimeType,
        fileName: image.fileName,
        size: image.size,
        dataUrlPrefix,
      },
      totalChunks: chunks.length,
    });
    if (!started) return false;

    for (let i = 0; i < chunks.length; i++) {
      const sent = await sendPacket({ type: 'chat-image-chunk', transferId, index: i, chunk: chunks[i] });
      if (!sent) return false;
    }
    return sendPacket({ type: 'chat-image-complete', transferId });
  }, [sendPacket]);

  const flushPendingDirect = useCallback(async () => {
    if (!peerId) return;
    const pending = await getPendingDirectMessagesForPeer(peerId);
    for (const item of pending) {
      const sent = await send(item.message);
      if (!sent) return;
      await removePendingDirectMessage(item.id);
    }
  }, [peerId, send]);

  useEffect(() => {
    if (!peerId) return;

    const incomingTransfers = incomingTransfersRef.current;
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    let negotiating = false;

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        sendSignal({ type: 'dc-ice', candidate: e.candidate.toJSON() });
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        setIsOpen(false);
        dcRef.current?.close();
        dcRef.current = null;
      }
    };

    if (!isOfferer) {
      pc.ondatachannel = (e) => setupDC(e.channel);
    }

    const emitReady = () => {
      sendSignal({ type: 'dc-ready' });
      sendIdentityKey();
    };
    if (wsClient.connected) emitReady();
    const unsubConnect = wsClient.onConnect(emitReady);

    let dc: RTCDataChannel | null = null;
    if (isOfferer) {
      dc = pc.createDataChannel('chat');
      setupDC(dc);
    }

    const unsub = wsClient.onMessage((msg) => {
      if (msg.type !== 'signal' || msg.from !== peerId) return;
      const { payload } = msg;

      if (payload.type === 'e2ee-key') {
        if (isRecord(payload.publicKey)) {
          rememberPeerPublicKey(peerId, payload.publicKey).catch((err) => {
            console.error('[E2EE] failed to store peer key', err);
          });
        }
        return;
      }

      if (payload.type === 'dc-ready') {
        if (isOfferer && !negotiating) {
          negotiating = true;
          pc.createOffer()
            .then((offer) => pc.setLocalDescription(offer))
            .then(() => {
              sendSignal({ type: 'dc-offer', sdp: pc.localDescription! });
            })
            .catch((err) => console.error('[DC] offer error', err));
        } else if (!isOfferer) {
          sendSignal({ type: 'dc-ready' });
          sendIdentityKey();
        }
        return;
      }

      if (payload.type === 'dc-offer') {
        pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
          .then(() => pc.createAnswer())
          .then((answer) => pc.setLocalDescription(answer))
          .then(() => {
            sendSignal({ type: 'dc-answer', sdp: pc.localDescription! });
          })
          .catch((err) => console.error('[DC] answer error', err));
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

    return () => {
      unsub();
      unsubConnect();
      incomingTransfers.clear();
      dc?.close();
      dcRef.current?.close();
      dcRef.current = null;
      pc.close();
      setIsOpen(false);
    };
  }, [peerId, wsClient, isOfferer, sendSignal, setupDC, sendIdentityKey]);

  useEffect(() => {
    if (!peerId || !isOpen) return;
    let cancelled = false;

    (async () => {
      if (cancelled) return;
      await flushPendingDirect();
    })().catch((err) => {
      console.error('[DC] pending direct flush failed', err);
    });

    const timer = window.setInterval(() => {
      flushPendingDirect().catch((err) => {
        console.error('[DC] pending direct periodic flush failed', err);
      });
    }, 3000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isOpen, peerId, flushPendingDirect]);

  return { send, isOpen, retryPending: flushPendingDirect };
}
