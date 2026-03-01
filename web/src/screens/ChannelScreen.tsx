import { useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useChannelPosts } from '../hooks/useChannelPosts';
import { MessageBubble } from '../components/MessageBubble';
import { Composer } from '../components/Composer';
import { generatePostId, type ChannelPost, type P2PMessage } from '@famchat/shared';
import type { Channel } from '../hooks/useChannels';
import type { WsClient } from '../services/wsClient';
import { ArrowLeft } from 'lucide-react';

interface P2PFunctions {
  broadcastP2P: (msg: P2PMessage) => void;
  sendToPeer: (peerId: string, msg: P2PMessage) => void;
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
  const { posts, sendPost } = useChannelPosts(channelId, wsClient, p2p);
  const bottomRef = useRef<HTMLDivElement>(null);

  const channel = channels.find(c => c.id === channelId);
  const isOwner = channel?.ownerId === currentUserId;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [posts.length]);

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

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 bg-gray-900">
        <button onClick={() => navigate('/channels')} className="p-2 text-emerald-400 transition-colors hover:text-emerald-300">
          <ArrowLeft size={20} />
        </button>
        <span className="font-semibold text-gray-100">{channel?.name ?? 'Channel'}</span>
      </div>
      <div className="flex-1 overflow-auto px-4 py-3">
        {posts.map(p => (
          <MessageBubble
            key={p.id}
            body={p.body}
            authorName={p.authorName}
            isMine={p.authorId === currentUserId}
            time={p.createdAt}
          />
        ))}
        <div ref={bottomRef} />
      </div>
      {isOwner ? (
        <Composer onSend={handleSend} />
      ) : (
        <div className="px-4 py-3 text-center text-xs text-gray-500 border-t border-gray-800">
          Only the channel owner can post
        </div>
      )}
    </div>
  );
}
