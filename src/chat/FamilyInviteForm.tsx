import React, { useState } from 'react';
import type { FamilyInvite } from '../services/familyService';

interface FamilyInviteFormProps {
  familyId: string;
  inviterId: string;
  inviterName: string;
  onInvite: (invite: FamilyInvite) => Promise<void>;
}

/**
 * Form component for inviting a new user to the family
 */
export const FamilyInviteForm: React.FC<FamilyInviteFormProps> = ({
  familyId,
  inviterId,
  inviterName,
  onInvite,
}) => {
  const [inviteeId, setInviteeId] = useState('');
  const [inviteeName, setInviteeName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!inviteeId.trim() || !inviteeName.trim()) {
      setError('Please enter both ID and name for the person you want to invite.');
      return;
    }

    setError('');
    setIsSubmitting(true);
    
    try {
      const invite: FamilyInvite = {
        inviteId: crypto.randomUUID(),
        inviteeId: inviteeId.trim(),
        inviteeName: inviteeName.trim(),
        inviterId,
        inviterName,
        createdAt: Date.now(),
        approvals: [inviterId], // Inviter automatically approves
        familyId,
      };
      
      await onInvite(invite);
      
      setSuccess(`Invitation sent to ${inviteeName}! Waiting for other family members to approve.`);
      setInviteeId('');
      setInviteeName('');
    } catch (err) {
      setError(`Failed to send invitation: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="family-invite-form">
      <h3>Invite Someone to Your Family</h3>
      
      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}
      
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="inviteeId">User ID to Invite:</label>
          <input
            id="inviteeId"
            type="text"
            value={inviteeId}
            onChange={(e) => setInviteeId(e.target.value)}
            placeholder="User ID"
            disabled={isSubmitting}
            required
          />
        </div>
        
        <div className="form-group">
          <label htmlFor="inviteeName">Name of Person:</label>
          <input
            id="inviteeName"
            type="text"
            value={inviteeName}
            onChange={(e) => setInviteeName(e.target.value)}
            placeholder="Name"
            disabled={isSubmitting}
            required
          />
        </div>
        
        <button 
          type="submit" 
          disabled={isSubmitting}
          data-testid="invite-btn"
        >
          {isSubmitting ? 'Sending Invitation...' : 'Send Invitation'}
        </button>
      </form>
    </div>
  );
};

export default FamilyInviteForm;
