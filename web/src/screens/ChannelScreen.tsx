import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useChannelPosts } from '../hooks/useChannelPosts';
import { MessageBubble } from '../components/MessageBubble';
import { Composer } from '../components/Composer';
import { generatePostId, type ChannelPost, type P2PMessage } from '@famchat/shared';
import type { Channel } from '../hooks/useChannels';
import type { WsClient } from '../services/wsClient';
import { getPendingChannelPosts } from '../chat/db';
import { ArrowLeft } from 'lucide-react';

const MAX_P2P_IMAGE_BYTES = 1024 * 1024;

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image.'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(file);
  });
}

interface P2PFunctions {
  broadcastP2P: (msg: P2PMessage) => Promise<void>;
  sendToPeer: (peerId: string, msg: P2PMessage) => Promise<boolean>;
  onP2PMessage: (handler: (peerId: string, msg: P2PMessage) => void) => () => void;
  connectedPeerIds: string[];
}

interface Props {
  currentUserId: string;
  currentUserName: string;
  wsClient: WsClient;
  channels: Channel[];
  p2p?: P2PFunctions;
}

export function ChannelScreen({ currentUserId, currentUserName, wsClient, channels, p2p }: Props) {
  const { channelId } = useParams<{ channelId: string }>();
  const navigate = useNavigate();
  const { posts, sendPost, retryPending } = useChannelPosts(channelId, wsClient, p2p);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [pendingByPostId, setPendingByPostId] = useState<Map<string, number>>(new Map());

  const channel = channels.find(c => c.id === channelId);
  const isOwner = channel?.ownerId === currentUserId;
  const connectedPeerCount = p2p?.connectedPeerIds.length ?? 0;
  const pendingCount = pendingByPostId.size;
  const totalSentPeers = useMemo(() => {
    let total = 0;
    for (const sentCount of pendingByPostId.values()) total += sentCount;
    return total;
  }, [pendingByPostId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [posts.length]);

  useEffect(() => {
    if (!channelId) {
      setPendingByPostId(new Map());
      return;
    }
    let cancelled = false;
    const refresh = async () => {
      const pending = await getPendingChannelPosts(channelId);
      if (cancelled) return;
      const next = new Map<string, number>();
      for (const item of pending) {
        next.set(item.id, item.sentTo.length);
      }
      setPendingByPostId(next);
    };
    refresh().catch((err) => console.error('[Channel] refresh pending failed', err));
    const timer = window.setInterval(() => {
      refresh().catch((err) => console.error('[Channel] refresh pending failed', err));
    }, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [channelId, connectedPeerCount, posts.length]);

  if (!channelId) return null;

  const handleSend = (text: string) => {
    const post: ChannelPost = {
      id: generatePostId(currentUserId),
      authorId: currentUserId,
      authorName: currentUserName,
      body: text,
      createdAt: Date.now(),
    };
    sendPost(post);
  };

  const handleSendImage = async (file: File) => {
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
      const post: ChannelPost = {
        id: generatePostId(currentUserId),
        authorId: currentUserId,
        authorName: currentUserName,
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
      sendPost(post);
    } catch (err) {
      console.error('[Channel] handleSendImage failed', err);
      window.alert('Could not send image.');
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 bg-gray-900">
        <button onClick={() => navigate('/channels')} className="p-2 text-emerald-400 transition-colors hover:text-emerald-300">
          <ArrowLeft size={20} />
        </button>
        <span className="font-semibold text-gray-100">{channel?.name ?? 'Channel'}</span>
      </div>
      <div className="px-4 py-1 text-[11px] text-gray-500 border-b border-gray-800 bg-gray-900/70 flex items-center justify-between">
        <span>Sync: {connectedPeerCount} peers • Pending {pendingCount} • Relayed {totalSentPeers}</span>
        {pendingCount > 0 && (
          <button
            type="button"
            onClick={() => retryPending().catch((err) => console.error('[Channel] retry pending failed', err))}
            className="text-emerald-400 hover:text-emerald-300"
          >
            Retry
          </button>
        )}
      </div>
      <div className="flex-1 overflow-auto px-4 py-3">
        {posts.map((p) => {
          const sentToCount = pendingByPostId.get(p.id);
          const statusLabel = p.authorId === currentUserId
            ? (sentToCount === undefined ? undefined : (sentToCount === 0 ? 'Pending' : `Sent to ${sentToCount}`))
            : undefined;
          return (
          <MessageBubble
            key={p.id}
            body={p.body}
            attachments={p.attachments}
            authorName={p.authorName}
            isMine={p.authorId === currentUserId}
            time={p.createdAt}
            statusLabel={statusLabel}
            onStatusClick={sentToCount === 0 ? () => retryPending().catch((err) => console.error('[Channel] retry pending failed', err)) : undefined}
          />
          );
        })}
        <div ref={bottomRef} />
      </div>
      {isOwner ? (
        <Composer onSend={handleSend} onSendImage={handleSendImage} />
      ) : (
        <div className="px-4 py-3 text-center text-xs text-gray-500 border-t border-gray-800">
          Only the channel owner can post
        </div>
      )}
    </div>
  );
}
