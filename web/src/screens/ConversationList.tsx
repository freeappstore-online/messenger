import { useNavigate } from 'react-router-dom';
import type { Conversation } from '../hooks/useConversations';
import { ConversationItem } from '../components/ConversationItem';

interface Props {
  conversations: Conversation[];
  currentUserId: string;
  onlineUsers: Set<string>;
  userNames: Map<string, string>;
}

export function ConversationList({ conversations, currentUserId, onlineUsers, userNames }: Props) {
  const navigate = useNavigate();

  return (
    <div>
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <h2 className="text-lg font-bold text-gray-100">Chats</h2>
        <button
          onClick={() => navigate('/contacts')}
          className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full text-xs font-medium transition-colors"
        >
          + New Chat
        </button>
      </div>
      {conversations.length === 0 && (
        <p className="py-6 text-center text-sm text-gray-500">No conversations yet. Start a new chat!</p>
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
            userNames={userNames}
          />
        );
      })}
    </div>
  );
}
