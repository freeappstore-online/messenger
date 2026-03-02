import { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMessages, type PlainMessage } from '../hooks/useMessages';
import { usePeerChannel } from '../hooks/usePeerChannel';
import { useUserNames } from '../hooks/useUserNames';
import { MessageBubble } from '../components/MessageBubble';
import { Composer } from '../components/Composer';
import { getPendingDirectMessagesForPeer, queuePendingDirectMessage } from '../chat/db';
import type { WsClient } from '../services/wsClient';
import type { ContactSettings } from '../hooks/useContactSettings';
import { ArrowLeft, Phone, Settings2, Video } from 'lucide-react';

const MAX_P2P_IMAGE_BYTES = 1024 * 1024;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image.'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(file);
  });
}

interface Props {
  currentUserId: string;
  currentUserName: string;
  wsClient: WsClient;
  onlineUsers: Set<string>;
  contactSettings: Map<string, ContactSettings>;
  onStartCall?: (peerId: string, media: 'audio' | 'video') => void;
}

export function ChatScreen({ currentUserId, currentUserName, wsClient, onlineUsers, contactSettings, onStartCall }: Props) {
  const { convId } = useParams<{ convId: string }>();
  const navigate = useNavigate();
  const { messages, sendMessage, receiveMessage, reactToMessage } = useMessages(convId, wsClient, currentUserId);
  const bottomRef = useRef<HTMLDivElement>(null);

  const parts = convId?.split(':') ?? [];
  const toUserId = parts.length === 2 ? parts.find(p => p !== currentUserId) : undefined;

  const peerChannel = usePeerChannel(toUserId, currentUserId, wsClient, receiveMessage);
  const [pendingDirectIds, setPendingDirectIds] = useState<Set<string>>(new Set());

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
  const peerName = toUserId
    ? (contactSettings.get(toUserId)?.nickname?.trim() || userNames.get(toUserId) || toUserId)
    : 'Group Chat';

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  useEffect(() => {
    if (!toUserId) {
      setPendingDirectIds(new Set());
      return;
    }
    let cancelled = false;
    const refresh = async () => {
      const pending = await getPendingDirectMessagesForPeer(toUserId);
      if (cancelled) return;
      setPendingDirectIds(new Set(pending.map((item) => item.id)));
    };
    refresh().catch((err) => console.error('[Chat] refresh pending direct failed', err));
    const timer = window.setInterval(() => {
      refresh().catch((err) => console.error('[Chat] refresh pending direct failed', err));
    }, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [toUserId, peerChannel.isOpen, messages.length]);

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
      const sent = peerChannel.send(msg);
      if (!sent) {
        sendMessage(msg, toUserId);
      }
    } else {
      sendMessage(msg, toUserId);
    }
  };

  const handleSendImage = async (file: File) => {
    if (!convId) return;
    if (!toUserId) return;
    if (!file.type.startsWith('image/')) {
      window.alert('Only image files are supported.');
      return;
    }
    if (file.size > MAX_P2P_IMAGE_BYTES) {
      window.alert('Image too large. Please pick an image up to 1MB.');
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      const msg: PlainMessage = {
        id: crypto.randomUUID(),
        authorId: currentUserId,
        authorName: currentUserName,
        convId,
        body: file.name || 'Photo',
        createdAt: Date.now(),
        attachments: [{
          id: crypto.randomUUID(),
          kind: 'image',
          mimeType: file.type || 'image/jpeg',
          fileName: file.name,
          size: file.size,
          dataUrl,
        }],
      };
      receiveMessage(msg);
      if (peerChannel.isOpen) {
        const sent = peerChannel.send(msg);
        if (!sent) {
          await queuePendingDirectMessage(toUserId, msg);
        }
      } else {
        await queuePendingDirectMessage(toUserId, msg);
      }
    } catch (err) {
      console.error('[Chat] handleSendImage failed', err);
      window.alert('Could not send image.');
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
            <button onClick={() => navigate(`/contact/${toUserId}/settings`)} className="p-2 text-emerald-400 transition-colors hover:text-emerald-300">
              <Settings2 size={20} />
            </button>
            <button onClick={() => onStartCall(toUserId, 'audio')} className="p-2 text-emerald-400 transition-colors hover:text-emerald-300">
              <Phone size={20} />
            </button>
            <button onClick={() => onStartCall(toUserId, 'video')} className="p-2 text-emerald-400 transition-colors hover:text-emerald-300">
              <Video size={20} />
            </button>
          </div>
        )}
      </div>
      <div className="px-4 py-1 text-[11px] text-gray-500 border-b border-gray-800 bg-gray-900/70 flex items-center justify-between">
        <span>Sync: {peerChannel.isOpen ? 'P2P connected' : 'Waiting for peer'} • Pending {pendingDirectIds.size}</span>
        {pendingDirectIds.size > 0 && (
          <button
            type="button"
            onClick={() => peerChannel.retryPending().catch((err) => console.error('[Chat] retry pending failed', err))}
            className="text-emerald-400 hover:text-emerald-300"
          >
            Retry
          </button>
        )}
      </div>
      <div className="flex-1 overflow-auto px-4 py-3">
        {messages.map((m) => {
          const isPending = m.authorId === currentUserId && pendingDirectIds.has(m.id);
          const hasAttachment = !!m.attachments && m.attachments.length > 0;
          const statusLabel = !hasAttachment || m.authorId !== currentUserId
            ? undefined
            : (isPending ? 'Pending' : 'Sent');
          return (
          <MessageBubble
            key={m.id}
            body={m.body}
            attachments={m.attachments}
            reactions={m.reactions}
            currentUserId={currentUserId}
            authorName={m.authorName}
            isMine={m.authorId === currentUserId}
            time={m.createdAt}
            onReact={m.authorId === currentUserId ? undefined : (emoji) => reactToMessage(m.id, emoji)}
            statusLabel={statusLabel}
            onStatusClick={isPending ? () => peerChannel.retryPending().catch((err) => console.error('[Chat] retry pending failed', err)) : undefined}
          />
          );
        })}
        <div ref={bottomRef} />
      </div>
      {isTyping && (
        <div className="px-4 py-1 text-xs text-gray-400">{peerName} is typing...</div>
      )}
      <Composer onSend={handleSend} onTyping={handleTyping} onSendImage={handleSendImage} />
    </div>
  );
}
