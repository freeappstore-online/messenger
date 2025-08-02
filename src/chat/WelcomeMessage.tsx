import React, { useEffect, useState } from 'react';
import './welcome-message.css';

interface WelcomeMessageProps {
  userName: string;
  connectedPeerCount: number;
  familyMemberCount: number;
}

/**
 * Displays a welcome message when the application starts
 * Shows user name, connection status, and family information
 */
export const WelcomeMessage: React.FC<WelcomeMessageProps> = ({ 
  userName, 
  connectedPeerCount,
  familyMemberCount
}) => {
  const [visible, setVisible] = useState(true);
  
  // Auto-hide the welcome message after 10 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
    }, 10000);
    
    return () => clearTimeout(timer);
  }, []);
  
  if (!visible) return null;
  
  return (
    <div className="welcome-message" data-testid="welcome-message">
      <div className="welcome-content">
        <h3>Welcome, {userName}! 👋</h3>
        
        <p>
          {connectedPeerCount === 0 ? (
            <>No family members are currently connected.</>
          ) : (
            <>You are connected to {connectedPeerCount} family {connectedPeerCount === 1 ? 'member' : 'members'}.</>
          )}
        </p>
        
        {familyMemberCount > 0 && (
          <p>Your family has {familyMemberCount} {familyMemberCount === 1 ? 'member' : 'members'} total.</p>
        )}
        
        <div className="welcome-actions">
          <button onClick={() => setVisible(false)}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
};

export default WelcomeMessage;
