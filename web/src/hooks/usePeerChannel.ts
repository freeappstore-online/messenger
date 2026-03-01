import { useState, useEffect, useRef, useCallback } from 'react';
import type { WsClient } from '../services/wsClient';
import type { PlainMessage, SignalPayload } from '@famchat/shared';

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export function usePeerChannel(
  peerId: string | undefined,
  currentUserId: string,
  wsClient: WsClient,
  onReceive: (msg: PlainMessage) => void,
) {
  const [isOpen, setIsOpen] = useState(false);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
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
        const msg = JSON.parse(e.data) as PlainMessage;
        console.log('[DC] recv msg', msg.id);
        onReceiveRef.current(msg);
      } catch { /* ignore malformed */ }
    };
  }, []);

  useEffect(() => {
    if (!peerId) return;

    console.log('[DC] init', { peerId, isOfferer, currentUserId });
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
      dc?.close();
      dcRef.current?.close();
      dcRef.current = null;
      pc.close();
      pcRef.current = null;
      setIsOpen(false);
    };
  }, [peerId, currentUserId, wsClient, isOfferer, sendSignal, setupDC]);

  const send = useCallback((msg: PlainMessage) => {
    dcRef.current?.send(JSON.stringify(msg));
  }, []);

  return { send, isOpen };
}
