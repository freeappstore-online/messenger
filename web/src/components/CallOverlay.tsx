import { useEffect, useRef } from 'react';
import type { CallInfo } from '../hooks/useCall';

interface Props {
  call: CallInfo;
  peerName: string;
  onAccept: () => void;
  onReject: () => void;
  onEnd: () => void;
  onToggleMute: () => void;
  onToggleVideo: () => void;
}

export function CallOverlay({ call, peerName, onAccept, onReject, onEnd, onToggleMute, onToggleVideo }: Props) {
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (remoteVideoRef.current && call.remoteStream) {
      remoteVideoRef.current.srcObject = call.remoteStream;
    }
  }, [call.remoteStream]);

  useEffect(() => {
    if (localVideoRef.current && call.localStream) {
      localVideoRef.current.srcObject = call.localStream;
    }
  }, [call.localStream]);

  const isVideo = call.media === 'video';
  const statusText = call.state === 'calling' ? 'Calling...'
    : call.state === 'ringing' ? 'Incoming call'
    : call.state === 'connected' ? 'Connected'
    : '';

  return (
    <div className="fixed inset-0 z-[1000] bg-gray-950 flex flex-col justify-between items-center">
      {isVideo && call.remoteStream && (
        <video ref={remoteVideoRef} autoPlay playsInline className="absolute inset-0 w-full h-full object-cover" />
      )}

      <div className="pt-12 pb-6 px-6 text-center w-full z-10">
        <div className="text-xl font-semibold text-white">{peerName}</div>
        <div className="text-sm text-gray-400">
          {statusText} {isVideo ? '(Video)' : '(Audio)'}
        </div>
      </div>

      {isVideo && call.localStream && (
        <video ref={localVideoRef} autoPlay playsInline muted className="absolute top-24 right-4 w-[120px] h-[160px] object-cover rounded-xl z-20 border-2 border-white" />
      )}

      <div className="flex gap-4 px-6 pb-12 z-10">
        {call.state === 'ringing' ? (
          <>
            <button onClick={onReject} className="px-6 py-3.5 bg-red-600 hover:bg-red-700 text-white rounded-full text-sm font-semibold min-w-[80px] transition-colors">Decline</button>
            <button onClick={onAccept} className="px-6 py-3.5 bg-green-600 hover:bg-green-700 text-white rounded-full text-sm font-semibold min-w-[80px] transition-colors">Accept</button>
          </>
        ) : (
          <>
            <button onClick={onToggleMute} className={`px-6 py-3.5 text-white rounded-full text-sm font-semibold min-w-[80px] transition-colors ${call.muted ? 'bg-amber-600 hover:bg-amber-700' : 'bg-gray-700 hover:bg-gray-600'}`}>
              {call.muted ? 'Unmute' : 'Mute'}
            </button>
            {isVideo && (
              <button onClick={onToggleVideo} className={`px-6 py-3.5 text-white rounded-full text-sm font-semibold min-w-[80px] transition-colors ${call.videoOff ? 'bg-amber-600 hover:bg-amber-700' : 'bg-gray-700 hover:bg-gray-600'}`}>
                {call.videoOff ? 'Cam On' : 'Cam Off'}
              </button>
            )}
            <button onClick={onEnd} className="px-6 py-3.5 bg-red-600 hover:bg-red-700 text-white rounded-full text-sm font-semibold min-w-[80px] transition-colors">End</button>
          </>
        )}
      </div>
    </div>
  );
}
