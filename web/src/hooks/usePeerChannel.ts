import { useState, useEffect, useRef, useCallback } from 'react';
import type { WsClient } from '../services/wsClient';
import type { MessageAttachment, PlainMessage, SignalPayload } from '@famchat/shared';

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

export function usePeerChannel(
  peerId: string | undefined,
  currentUserId: string,
  wsClient: WsClient,
  onReceive: (msg: PlainMessage) => void,
) {
  const [isOpen, setIsOpen] = useState(false);
  const pcRef = useRef<RTCPeerConnection | null>(null);
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

  const setupDC = useCallback((dc: RTCDataChannel) => {
    dcRef.current = dc;
    dc.onopen = () => { console.log('[DC] open'); setIsOpen(true); };
    dc.onclose = () => { console.log('[DC] close'); setIsOpen(false); };
    dc.onerror = (e) => console.error('[DC] error', e);
    dc.onmessage = (e) => {
      try {
        if (typeof e.data !== 'string') return;
        const parsed: unknown = JSON.parse(e.data);

        // Backward compatibility: handle old payload format directly.
        if (isPlainMessage(parsed)) {
          console.log('[DC] recv msg', parsed.id);
          onReceiveRef.current(parsed);
          return;
        }

        if (!isRecord(parsed) || typeof parsed.type !== 'string') return;
        const packet = parsed as DCPacket;
        if (packet.type === 'chat-message') {
          console.log('[DC] recv msg', packet.message.id);
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
      } catch { /* ignore malformed */ }
    };
  }, []);

  useEffect(() => {
    if (!peerId) return;

    console.log('[DC] init', { peerId, isOfferer, currentUserId });
    const incomingTransfers = incomingTransfersRef.current;
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;
    let negotiating = false;

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        sendSignal({ type: 'dc-ice', candidate: e.candidate.toJSON() });
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log('[DC] ice state:', pc.iceConnectionState);
    };

    pc.onconnectionstatechange = () => {
      console.log('[DC] conn state:', pc.connectionState);
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        setIsOpen(false);
        dcRef.current?.close();
        dcRef.current = null;
      }
    };

    if (!isOfferer) {
      pc.ondatachannel = (e) => setupDC(e.channel);
    }

    // Send dc-ready now if connected, and also on every (re)connect
    const emitReady = () => {
      console.log('[DC] sending dc-ready (wsConnected=' + wsClient.connected + ')');
      sendSignal({ type: 'dc-ready' });
    };
    if (wsClient.connected) emitReady();
    const unsubConnect = wsClient.onConnect(emitReady);

    // Offerer creates data channel eagerly
    let dc: RTCDataChannel | null = null;
    if (isOfferer) {
      dc = pc.createDataChannel('chat');
      setupDC(dc);
    }

    const unsub = wsClient.onMessage((msg) => {
      if (msg.type !== 'signal' || msg.from !== peerId) return;
      const { payload } = msg;

      if (payload.type === 'dc-ready') {
        console.log('[DC] recv dc-ready', { isOfferer, negotiating });
        if (isOfferer && !negotiating) {
          negotiating = true;
          pc.createOffer()
            .then((offer) => pc.setLocalDescription(offer))
            .then(() => {
              console.log('[DC] sending dc-offer');
              sendSignal({ type: 'dc-offer', sdp: pc.localDescription! });
            })
            .catch((err) => console.error('[DC] offer error', err));
        } else if (!isOfferer) {
          sendSignal({ type: 'dc-ready' });
        }
        return;
      }

      if (payload.type === 'dc-offer') {
        console.log('[DC] recv dc-offer');
        pc.setRemoteDescription(new RTCSessionDescription(payload.sdp))
          .then(() => pc.createAnswer())
          .then((answer) => pc.setLocalDescription(answer))
          .then(() => {
            console.log('[DC] sending dc-answer');
            sendSignal({ type: 'dc-answer', sdp: pc.localDescription! });
          })
          .catch((err) => console.error('[DC] answer error', err));
        return;
      }

      if (payload.type === 'dc-answer') {
        console.log('[DC] recv dc-answer');
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
      pcRef.current = null;
      setIsOpen(false);
    };
  }, [peerId, currentUserId, wsClient, isOfferer, sendSignal, setupDC]);

  const sendPacket = useCallback((packet: DCPacket) => {
    const dc = dcRef.current;
    if (!dc || dc.readyState !== 'open') return;
    dc.send(JSON.stringify(packet));
  }, []);

  const send = useCallback((msg: PlainMessage) => {
    const image = msg.attachments?.find((attachment) => attachment.kind === 'image');
    if (!image) {
      sendPacket({ type: 'chat-message', message: msg });
      return;
    }

    const commaIndex = image.dataUrl.indexOf(',');
    if (commaIndex < 0) {
      sendPacket({ type: 'chat-message', message: msg });
      return;
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

    sendPacket({
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

    chunks.forEach((chunk, index) => {
      sendPacket({ type: 'chat-image-chunk', transferId, index, chunk });
    });
    sendPacket({ type: 'chat-image-complete', transferId });
  }, [sendPacket]);

  return { send, isOpen };
}
