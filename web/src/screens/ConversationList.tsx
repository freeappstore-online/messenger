import { useNavigate } from 'react-router-dom';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { Conversation } from '../hooks/useConversations';
import { ConversationItem } from '../components/ConversationItem';

interface Props {
  conversations: Conversation[];
  currentUserId: string;
  onlineUsers: Set<string>;
}

export function ConversationList({ conversations, currentUserId, onlineUsers }: Props) {
  const navigate = useNavigate();

  const startNewChat = async () => {
    const peerId = prompt('Enter user ID to chat with:');
    if (!peerId || peerId === currentUserId) return;

    // Create deterministic conversation ID
    const sorted = [currentUserId, peerId].sort();
    const convId = sorted.join(':');
    await setDoc(doc(db, 'conversations', convId), {
      type: '1:1',
      members: sorted,
      name: null,
      lastMessage: null,
      lastMessageAt: null,
      updatedAt: Date.now(),
    }, { merge: true });
    navigate(`/chat/${convId}`);
  };

  return (
    <div>
      <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #eee' }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>Chats</h2>
        <button onClick={startNewChat} style={newChatBtn}>+ New Chat</button>
      </div>
      {conversations.length === 0 && (
        <p style={{ padding: 24, textAlign: 'center', color: '#888' }}>No conversations yet. Start a new chat!</p>
      )}
      {conversations.map(c => {
        const otherMembers = c.members.filter(m => m !== currentUserId);
        const isOnline = otherMembers.some(m => onlineUsers.has(m));
        return (
          <ConversationItem
            key={c.id}
            conversation={c}
            currentUserId={currentUserId}
            onClick={() => navigate(`/chat/${c.id}`)}
            online={c.type === '1:1' ? isOnline : undefined}
          />
        );
      })}
    </div>
  );
}

const newChatBtn: React.CSSProperties = {
  padding: '6px 14px', background: '#007aff', color: '#fff',
  border: 'none', borderRadius: 16, fontSize: 14, cursor: 'pointer',
};
