import { useNavigate } from 'react-router-dom';
import type { Conversation } from '../hooks/useConversations';
import { ConversationItem } from '../components/ConversationItem';
import { SquarePen } from 'lucide-react';

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
          className="p-2 text-emerald-400 transition-colors hover:text-emerald-300"
        >
          <SquarePen size={20} />
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
