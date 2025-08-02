import React, { useState } from 'react';
import type { FamilyInvite, FamilyMember } from '../services/familyService';

interface PendingInvitesProps {
  invites: FamilyInvite[];
  currentUserId: string;
  familyMembers: FamilyMember[];
  onApprove: (inviteId: string) => Promise<void>;
  onReject: (inviteId: string) => Promise<void>;
}

/**
 * Component that displays pending family invites and allows approving or rejecting them
 */
export const PendingInvites: React.FC<PendingInvitesProps> = ({
  invites,
  currentUserId,
  familyMembers,
  onApprove,
  onReject,
}) => {
  const [processing, setProcessing] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  if (!invites.length) {
    return <p className="no-invites">No pending invites</p>;
  }

  const handleApprove = async (inviteId: string) => {
    setProcessing((prev) => ({ ...prev, [inviteId]: true }));
    setError(null);
    
    try {
      await onApprove(inviteId);
    } catch (err) {
      setError(`Failed to approve: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setProcessing((prev) => ({ ...prev, [inviteId]: false }));
    }
  };

  const handleReject = async (inviteId: string) => {
    setProcessing((prev) => ({ ...prev, [inviteId]: true }));
    setError(null);
    
    try {
      await onReject(inviteId);
    } catch (err) {
      setError(`Failed to reject: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setProcessing((prev) => ({ ...prev, [inviteId]: false }));
    }
  };

  // Calculate how many total approvals are needed for each invite
  const totalFamilyMembersCount = familyMembers.length;

  return (
    <div className="pending-invites">
      <h3>Pending Family Invites</h3>
      
      {error && <div className="error-message">{error}</div>}
      
      <ul className="invites-list">
        {invites.map((invite) => {
          const userHasApproved = invite.approvals.includes(currentUserId);
          const approvalCount = invite.approvals.length;
          const pendingCount = totalFamilyMembersCount - approvalCount;
          const approvalProgress = Math.round((approvalCount / totalFamilyMembersCount) * 100);
          const isFullyApproved = approvalCount === totalFamilyMembersCount;
          
          return (
            <li key={invite.inviteId} className="invite-item">
              <div className="invite-details">
                <div className="invite-header">
                  <strong>{invite.inviteeName}</strong> ({invite.inviteeId})
                </div>
                <div className="invite-meta">
                  Invited by: {invite.inviterName} on {new Date(invite.createdAt).toLocaleDateString()}
                </div>
                <div className="approval-status">
                  <div className="approval-progress">
                    <div 
                      className="progress-bar" 
                      style={{ width: `${approvalProgress}%` }}
                    ></div>
                  </div>
                  <div className="approval-text">
                    {approvalCount}/{totalFamilyMembersCount} approvals
                    {pendingCount > 0 && ` (${pendingCount} pending)`}
                  </div>
                </div>
              </div>
              
              <div className="invite-actions">
                {!userHasApproved && !isFullyApproved && (
                  <button
                    onClick={() => handleApprove(invite.inviteId)}
                    disabled={processing[invite.inviteId]}
                    className="approve-btn"
                    data-testid={`approve-${invite.inviteId}`}
                  >
                    {processing[invite.inviteId] ? 'Approving...' : 'Approve'}
                  </button>
                )}
                
                {userHasApproved && !isFullyApproved && (
                  <span className="approved-badge">You approved</span>
                )}
                
                {isFullyApproved && (
                  <span className="fully-approved-badge">Fully Approved!</span>
                )}
                
                {!isFullyApproved && (
                  <button
                    onClick={() => handleReject(invite.inviteId)}
                    disabled={processing[invite.inviteId]}
                    className="reject-btn"
                    data-testid={`reject-${invite.inviteId}`}
                  >
                    {processing[invite.inviteId] ? 'Rejecting...' : 'Reject'}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default PendingInvites;
