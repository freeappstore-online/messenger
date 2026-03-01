import { useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMessages, type PlainMessage } from '../hooks/useMessages';
import { MessageBubble } from '../components/MessageBubble';
import { Composer } from '../components/Composer';
import type { WsClient } from '../services/wsClient';

interface Props {
  currentUserId: string;
  currentUserName: string;
  wsClient: WsClient;
}

export function ChatScreen({ currentUserId, currentUserName, wsClient }: Props) {
  const { convId } = useParams<{ convId: string }>();
  const navigate = useNavigate();
  const { messages, sendMessage } = useMessages(convId, wsClient);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  if (!convId) return null;

  // For 1:1, the other user is the one who isn't us in the convId
  const parts = convId.split(':');
  const toUserId = parts.length === 2 ? parts.find(p => p !== currentUserId) : undefined;

  const handleSend = (text: string) => {
    const msg: PlainMessage = {
      id: crypto.randomUUID(),
      authorId: currentUserId,
      authorName: currentUserName,
      convId,
      body: text,
      createdAt: Date.now(),
    };
    sendMessage(msg, toUserId);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={headerStyle}>
        <button onClick={() => navigate('/')} style={backBtn}>Back</button>
        <span style={{ fontWeight: 600 }}>{toUserId ?? 'Group Chat'}</span>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '12px 16px' }}>
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
      <Composer onSend={handleSend} />
    </div>
  );
}

const headerStyle: React.CSSProperties = {
  padding: '12px 16px', borderBottom: '1px solid #eee',
  display: 'flex', alignItems: 'center', gap: 12, background: '#fff',
};

const backBtn: React.CSSProperties = {
  background: 'none', border: 'none', color: '#007aff',
  fontSize: 15, cursor: 'pointer', padding: 0,
};
