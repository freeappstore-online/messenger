import type { Conversation } from '../hooks/useConversations';

interface Props {
  conversation: Conversation;
  currentUserId: string;
  onClick: () => void;
  online?: boolean;
  userNames: Map<string, string>;
}

export function ConversationItem({ conversation, currentUserId, onClick, online, userNames }: Props) {
  const otherMembers = conversation.members.filter(m => m !== currentUserId);
  const resolvedNames = otherMembers.map(m => userNames.get(m) ?? m);
  const displayName = conversation.name || resolvedNames.join(', ') || 'Chat';

  return (
    <div onClick={onClick} className="px-4 py-3 border-b border-gray-800 cursor-pointer hover:bg-gray-900 transition-colors">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          {online !== undefined && (
            <span className="relative flex h-2 w-2">
              {online && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />}
              <span className={`relative inline-flex h-2 w-2 rounded-full ${online ? 'bg-green-500' : 'bg-gray-600'}`} />
            </span>
          )}
          <span className="font-semibold text-sm text-gray-100">{displayName}</span>
        </div>
        {conversation.lastMessage && (
          <p className="mt-1 text-xs text-gray-500 truncate">{conversation.lastMessage}</p>
        )}
      </div>
    </div>
  );
}
