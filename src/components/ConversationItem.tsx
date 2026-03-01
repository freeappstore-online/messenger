import type { Conversation } from '../hooks/useConversations';

interface Props {
  conversation: Conversation;
  currentUserId: string;
  onClick: () => void;
  online?: boolean;
}

export function ConversationItem({ conversation, currentUserId, onClick, online }: Props) {
  const otherMembers = conversation.members.filter(m => m !== currentUserId);
  const displayName = conversation.name || otherMembers.join(', ') || 'Chat';

  return (
    <div onClick={onClick} style={rowStyle}>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {online !== undefined && (
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: online ? '#4caf50' : '#bbb',
              display: 'inline-block',
            }} />
          )}
          <span style={{ fontWeight: 600, fontSize: 15 }}>{displayName}</span>
        </div>
        {conversation.lastMessage && (
          <p style={{ margin: '4px 0 0', fontSize: 13, color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {conversation.lastMessage}
          </p>
        )}
      </div>
    </div>
  );
}

const rowStyle: React.CSSProperties = {
  padding: '12px 16px', borderBottom: '1px solid #eee', cursor: 'pointer',
};
