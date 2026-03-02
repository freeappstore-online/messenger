import { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMessages, type PlainMessage } from '../hooks/useMessages';
import { usePeerChannel } from '../hooks/usePeerChannel';
import { useUserNames } from '../hooks/useUserNames';
import { MessageBubble } from '../components/MessageBubble';
import { Composer } from '../components/Composer';
import type { WsClient } from '../services/wsClient';
import { ArrowLeft, Phone, Video } from 'lucide-react';

interface Props {
  currentUserId: string;
  currentUserName: string;
  wsClient: WsClient;
  onlineUsers: Set<string>;
  onStartCall?: (peerId: string, media: 'audio' | 'video') => void;
}

export function ChatScreen({ currentUserId, currentUserName, wsClient, onlineUsers, onStartCall }: Props) {
  const { convId } = useParams<{ convId: string }>();
  const navigate = useNavigate();
  const { messages, sendMessage, receiveMessage } = useMessages(convId, wsClient);
  const bottomRef = useRef<HTMLDivElement>(null);

  const parts = convId?.split(':') ?? [];
  const toUserId = parts.length === 2 ? parts.find(p => p !== currentUserId) : undefined;

  const peerChannel = usePeerChannel(toUserId, currentUserId, wsClient, receiveMessage);

  // Typing indicator
  const [isTyping, setIsTyping] = useState(false);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    return wsClient.onMessage((msg) => {
      if (msg.type === 'typing' && msg.convId === convId) {
        setIsTyping(true);
        clearTimeout(typingTimerRef.current);
        typingTimerRef.current = setTimeout(() => setIsTyping(false), 3000);
      }
    });
  }, [wsClient, convId]);

  useEffect(() => {
    return () => clearTimeout(typingTimerRef.current);
  }, []);

  const handleTyping = useCallback(() => {
    if (toUserId && convId) {
      wsClient.send({ type: 'typing', to: toUserId, convId });
    }
  }, [wsClient, toUserId, convId]);

  const peerIds = useMemo(() => toUserId ? [toUserId] : [], [toUserId]);
  const userNames = useUserNames(peerIds);
  const peerName = toUserId ? (userNames.get(toUserId) ?? toUserId) : 'Group Chat';

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  if (!convId) return null;

  const handleSend = (text: string) => {
    const msg: PlainMessage = {
      id: crypto.randomUUID(),
      authorId: currentUserId,
      authorName: currentUserName,
      convId,
      body: text,
      createdAt: Date.now(),
    };
    console.log('[Chat] handleSend', { dcOpen: peerChannel.isOpen, toUserId, path: peerChannel.isOpen && toUserId ? 'P2P' : 'WS' });
    if (peerChannel.isOpen && toUserId) {
      receiveMessage(msg);
      peerChannel.send(msg);
    } else {
      sendMessage(msg, toUserId);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 bg-gray-900">
        <button onClick={() => navigate('/')} className="p-2 text-emerald-400 transition-colors hover:text-emerald-300">
          <ArrowLeft size={20} />
        </button>
        <div className="flex items-center gap-2 flex-1">
          {toUserId && (
            <span className="relative flex h-2 w-2">
              {onlineUsers.has(toUserId) && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />}
              <span className={`relative inline-flex h-2 w-2 rounded-full ${onlineUsers.has(toUserId) ? 'bg-green-500' : 'bg-gray-600'}`} />
            </span>
          )}
          <span className="font-semibold text-gray-100">{peerName}</span>
        </div>
        {toUserId && onStartCall && (
          <div className="flex gap-1">
            <button onClick={() => onStartCall(toUserId, 'audio')} className="p-2 text-emerald-400 transition-colors hover:text-emerald-300">
              <Phone size={20} />
            </button>
            <button onClick={() => onStartCall(toUserId, 'video')} className="p-2 text-emerald-400 transition-colors hover:text-emerald-300">
              <Video size={20} />
            </button>
          </div>
        )}
      </div>
      <div className="flex-1 overflow-auto px-4 py-3">
        {messages.map(m => (
          <MessageBubble
            key={m.id}
            body={m.body}
            authorName={m.authorName}
            isMine={m.authorId === currentUserId}
            time={m.createdAt}
          />
        ))}
        <div ref={bottomRef} />
      </div>
      {isTyping && (
        <div className="px-4 py-1 text-xs text-gray-400">{peerName} is typing...</div>
      )}
      <Composer onSend={handleSend} onTyping={handleTyping} />
    </div>
  );
}
