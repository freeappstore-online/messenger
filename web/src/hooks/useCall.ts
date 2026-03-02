import { useState, useEffect, useRef, useCallback } from 'react';
import type { WsClient } from '../services/wsClient';
import type { SignalPayload } from '@famchat/shared';

export type CallState = 'idle' | 'calling' | 'ringing' | 'connected' | 'ended';

export interface CallInfo {
  state: CallState;
  peerId: string | null;
  callId: string | null;
  media: 'audio' | 'video';
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  muted: boolean;
  videoOff: boolean;
}

function createIdleCall(): CallInfo {
  return {
    state: 'idle',
    peerId: null,
    callId: null,
    media: 'audio',
    localStream: null,
    remoteStream: null,
    muted: false,
    videoOff: false,
  };
}

function getCallErrorMessage(err: unknown): string {
  if (err instanceof DOMException) {
    if (err.name === 'NotAllowedError') return 'Microphone/camera permission was denied.';
    if (err.name === 'NotFoundError') return 'No microphone/camera device was found.';
    if (err.name === 'NotReadableError') return 'Microphone/camera is in use by another app.';
    if (err.name === 'SecurityError') return 'Calls require HTTPS (or localhost) in this browser.';
  }
  if (err instanceof Error) return err.message;
  return 'Unable to start the call.';
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

export function useCall(currentUserId: string | undefined, wsClient: WsClient) {
  const [call, setCall] = useState<CallInfo>(createIdleCall);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const callRef = useRef(call);
  callRef.current = call;

  const sendSignal = useCallback((to: string, payload: SignalPayload) => {
    wsClient.send({ type: 'signal', to, payload });
  }, [wsClient]);

  const cleanup = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    setCall(createIdleCall());
  }, []);

  const createPC = useCallback((peerId: string) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const remote = new MediaStream();
    remoteStreamRef.current = remote;

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        sendSignal(peerId, { type: 'ice', candidate: e.candidate.toJSON() });
      }
    };

    pc.ontrack = (e) => {
      remote.addTrack(e.track);
      setCall(prev => ({ ...prev, remoteStream: remote }));
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        setCall(prev => ({ ...prev, state: 'connected' }));
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        cleanup();
      }
    };

    pcRef.current = pc;
    return pc;
  }, [sendSignal, cleanup]);

  const getMedia = useCallback(async (media: 'audio' | 'video') => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('This browser cannot access microphone/camera here. Use HTTPS (or localhost) and allow permissions.');
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: media === 'video',
    });
    localStreamRef.current = stream;
    return stream;
  }, []);

  const startCall = useCallback(async (peerId: string, media: 'audio' | 'video') => {
    console.log('[Call] startCall', { peerId, media, state: callRef.current.state, wsConnected: wsClient.connected });
    if (!currentUserId || callRef.current.state !== 'idle') return;
    if (!wsClient.connected) {
      window.alert('Realtime connection is offline. Please wait a second and try again.');
      return;
    }

    try {
      const callId = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const stream = await getMedia(media);
      const pc = createPC(peerId);

      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      sendSignal(peerId, { type: 'call-offer', callId, media });
      sendSignal(peerId, { type: 'offer', sdp: pc.localDescription! });

      setCall({
        state: 'calling', peerId, callId, media,
        localStream: stream, remoteStream: null, muted: false, videoOff: false,
      });
    } catch (err) {
      console.error('[Call] startCall failed', err);
      cleanup();
      window.alert(getCallErrorMessage(err));
    }
  }, [cleanup, currentUserId, createPC, getMedia, sendSignal, wsClient]);

  const acceptCall = useCallback(async () => {
    const { peerId, callId, media } = callRef.current;
    if (!peerId || !callId || callRef.current.state !== 'ringing') return;
    if (!wsClient.connected) {
      window.alert('Realtime connection is offline. Please wait a second and try again.');
      return;
    }

    try {
      const stream = await getMedia(media);
      const pc = pcRef.current!;

      stream.getTracks().forEach(t => pc.addTrack(t, stream));

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      sendSignal(peerId, { type: 'call-answer', callId });
      sendSignal(peerId, { type: 'answer', sdp: pc.localDescription! });

      setCall(prev => ({ ...prev, state: 'connected', localStream: stream }));
    } catch (err) {
      console.error('[Call] acceptCall failed', err);
      sendSignal(peerId, { type: 'call-reject', callId });
      cleanup();
      window.alert(getCallErrorMessage(err));
    }
  }, [cleanup, getMedia, sendSignal, wsClient]);

  const rejectCall = useCallback(() => {
    const { peerId, callId } = callRef.current;
    if (peerId && callId) {
      sendSignal(peerId, { type: 'call-reject', callId });
    }
    cleanup();
  }, [sendSignal, cleanup]);

  const endCall = useCallback(() => {
    const { peerId, callId } = callRef.current;
    if (peerId && callId) {
      sendSignal(peerId, { type: 'call-end', callId });
    }
    cleanup();
  }, [sendSignal, cleanup]);

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const audio = stream.getAudioTracks()[0];
    if (audio) {
      audio.enabled = !audio.enabled;
      setCall(prev => ({ ...prev, muted: !audio.enabled }));
    }
  }, []);

  const toggleVideo = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const video = stream.getVideoTracks()[0];
    if (video) {
      video.enabled = !video.enabled;
      setCall(prev => ({ ...prev, videoOff: !video.enabled }));
    }
  }, []);

  // Listen for incoming signals
  useEffect(() => {
    if (!currentUserId) return;

    return wsClient.onMessage((msg) => {
      if (msg.type !== 'signal') return;
      const { from, payload } = msg;

      console.log('[Call] signal recv', { from, type: payload.type, callState: callRef.current.state });

      if (payload.type === 'call-offer') {
        // Incoming call
        if (callRef.current.state !== 'idle') {
          console.log('[Call] busy — auto-rejecting');
          // Busy — auto-reject
          sendSignal(from, { type: 'call-reject', callId: payload.callId });
          return;
        }
        console.log('[Call] incoming call from', from, payload.media);
        // Create PC to receive the offer (tracks added on accept)
        createPC(from);
        setCall({
          state: 'ringing', peerId: from, callId: payload.callId, media: payload.media,
          localStream: null, remoteStream: null, muted: false, videoOff: false,
        });
        return;
      }

      if (payload.type === 'call-answer') {
        console.log('[Call] call answered by', from);
        setCall(prev => ({ ...prev, state: 'connected' }));
        return;
      }

      if (payload.type === 'call-reject' || payload.type === 'call-end') {
        console.log('[Call] call ended/rejected by', from);
        cleanup();
        return;
      }

      // WebRTC negotiation signals
      const pc = pcRef.current;
      if (!pc) {
        console.warn('[Call] no PC for signal', payload.type);
        return;
      }

      if (payload.type === 'offer') {
        pc.setRemoteDescription(new RTCSessionDescription(payload.sdp)).catch(console.error);
      } else if (payload.type === 'answer') {
        pc.setRemoteDescription(new RTCSessionDescription(payload.sdp)).catch(console.error);
      } else if (payload.type === 'ice') {
        pc.addIceCandidate(new RTCIceCandidate(payload.candidate)).catch(console.error);
      }
    });
  }, [currentUserId, wsClient, sendSignal, createPC, cleanup]);

  // Cleanup on unmount
  useEffect(() => cleanup, [cleanup]);

  return { call, startCall, acceptCall, rejectCall, endCall, toggleMute, toggleVideo };
}
