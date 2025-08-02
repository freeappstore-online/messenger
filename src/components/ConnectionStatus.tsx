import React from 'react';
import './connection-status.css';

interface ConnectionStatusProps {
  userId: string;
  familyMembers: Array<{
    userId: string;
    displayName: string;
    joinedAt: number;
  }>;
  connections: Record<string, RTCPeerConnectionState>;
  onlineStatus: Record<string, boolean>;
  pendingInvites: Array<{
    inviteeId: string;
    inviteeName: string;
  }>;
}

/**
 * ConnectionStatus component displays a list of all family members and their connection status
 * It shows:
 * - Green dot for online users
 * - Grey dot for offline users
 * - Empty dot for invited but not yet confirmed users
 */
export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  userId,
  familyMembers,
  connections,
  onlineStatus,
  pendingInvites = [],
}) => {
  // Helper function to get user's display name
  const getUserDisplayName = (id: string) => {
    const member = familyMembers.find(m => m.userId === id);
    return member ? member.displayName : `User-${id.substring(0, 6)}`;
  };

  // Get connection state for a specific user
  const getConnectionState = (id: string): 'connected' | 'connecting' | 'disconnected' => {
    const state = connections[id];
    if (!state) return 'disconnected';
    if (state === 'connected') return 'connected';
    if (['new', 'connecting', 'checking'].includes(state)) return 'connecting';
    return 'disconnected';
  };

  // Check if user is online
  const isUserOnline = (id: string): boolean => {
    return !!onlineStatus[id];
  };

  // Check if a user is invited but not yet a member
  const isUserInvited = (id: string): boolean => {
    return pendingInvites.some(invite => invite.inviteeId === id);
  };

  return (
    <div className="connection-status-container">
      <h3>Connection Status</h3>
      <div className="connection-status-list">
        {familyMembers.map(member => (
          <div 
            key={member.userId} 
            className={`connection-status-item ${member.userId === userId ? 'current-user' : ''}`}
          >
            <div className="connection-status-name">
              {member.displayName || `User-${member.userId.substring(0, 6)}`}
              {member.userId === userId && <span className="you-indicator"> (You)</span>}
            </div>
            <div className="connection-status-indicator">
              <div 
                className={`status-dot ${
                  member.userId === userId 
                    ? 'self'
                    : isUserOnline(member.userId)
                      ? 'online'
                      : 'offline'
                }`}
                title={
                  member.userId === userId 
                    ? 'You' 
                    : isUserOnline(member.userId) 
                      ? 'Online' 
                      : 'Offline'
                }
              />
              <div className="connection-status-text">
                {member.userId === userId 
                  ? 'You' 
                  : getConnectionState(member.userId) === 'connected'
                    ? 'Connected'
                    : getConnectionState(member.userId) === 'connecting'
                      ? 'Connecting...'
                      : 'Not Connected'}
              </div>
            </div>
          </div>
        ))}
        
        {/* Show pending invites */}
        {pendingInvites.map(invite => {
          // Skip if this user is already a member
          if (familyMembers.some(m => m.userId === invite.inviteeId)) return null;
          
          return (
            <div key={invite.inviteeId} className="connection-status-item invited">
              <div className="connection-status-name">
                {invite.inviteeName || `User-${invite.inviteeId.substring(0, 6)}`}
                <span className="invited-indicator"> (Invited)</span>
              </div>
              <div className="connection-status-indicator">
                <div 
                  className="status-dot invited"
                  title="Invited"
                />
                <div className="connection-status-text">Pending</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ConnectionStatus;
