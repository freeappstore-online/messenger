import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import './mobile-chat.css';
import { auth, db } from './firebase';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
// Note: We no longer use Firestore for signaling, only for persistent family data
import type { ISignalingService } from './services/signalingInterface';
import { useP2P } from './rtc/useP2P';
import { useChat } from './chat/useChat';
import { NoopCryptoAdapter } from './crypto/noopCrypto';
import { createFamilyService } from './services/familyService';
import type { FamilyMember, FamilyInvite } from './services/familyService';
import FamilyInviteForm from './chat/FamilyInviteForm';
import PendingInvites from './chat/PendingInvites';
import { createQrSignalingService } from './services/qrSignalingFactory';
import { QrSignaling } from './components/QrSignaling';
import { ConnectionStatus } from './components/ConnectionStatus';

// Feature flag to reduce Firestore operations in development/test environments
// Should be pulled from environment variables in a real app
const IS_PRODUCTION = false; 

// Using QR code-based signaling (no server required)

// Firestore polling intervals (in milliseconds)
const REFRESH_INTERVAL_PROD = 10000;  // 10 seconds for production
const REFRESH_INTERVAL_DEV = 60000;   // 1 minute for development

// Service for family data management
const familyService = createFamilyService(db);

const provider = new GoogleAuthProvider(); // easiest for POC

const FAMILY_ID = 'demo-family-1'; // in real app, let users create/join

// Define page types for navigation
type AppPage = 'connections' | 'messaging';

export const App: React.FC = () => {
  const [userId, setUserId] = useState<string | null>(null);
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [familyInvites, setFamilyInvites] = useState<FamilyInvite[]>([]);
  const [familyInitialized, setFamilyInitialized] = useState(false);
  const [activePage, setActivePage] = useState<AppPage>('connections'); // Default to connections page
  const [showInviteForm, setShowInviteForm] = useState(false);
  const crypto = useMemo(() => NoopCryptoAdapter, []);

  // auth
  useEffect(() => {
    return onAuthStateChanged(auth, u => setUserId(u?.uid ?? null));
  }, []);

  // Cache for family data to reduce Firestore operations
  const familyDataCache = useRef({
    lastMembersFetch: 0,
    lastInvitesFetch: 0,
    membershipChecked: false
  });
  
  // Get the appropriate refresh interval based on environment
  const getRefreshInterval = useCallback(() => {
    return IS_PRODUCTION ? REFRESH_INTERVAL_PROD : REFRESH_INTERVAL_DEV;
  }, []);

  // Load family members with caching
  const loadFamilyMembers = useCallback(async (force = false) => {
    if (!userId) return;
    
    const now = Date.now();
    const refreshInterval = getRefreshInterval();
    
    // Skip if we've fetched recently and not forcing refresh
    if (!force && now - familyDataCache.current.lastMembersFetch < refreshInterval) {
      console.log('[App] Using cached family members data');
      return;
    }
    
    try {
      console.log('[App] Fetching family members from Firestore');
      const members = await familyService.getMembers(FAMILY_ID);
      setFamilyMembers(members);
      familyDataCache.current.lastMembersFetch = now;
    } catch (err) {
      console.error('[App] Failed to load family members:', err);
    }
  }, [userId, getRefreshInterval]);
  
  // Load family invites with caching
  const loadFamilyInvites = useCallback(async (force = false) => {
    if (!userId) return;
    
    const now = Date.now();
    const refreshInterval = getRefreshInterval();
    
    // Skip if we've fetched recently and not forcing refresh
    if (!force && now - familyDataCache.current.lastInvitesFetch < refreshInterval) {
      console.log('[App] Using cached family invites data');
      return;
    }
    
    try {
      console.log('[App] Fetching family invites from Firestore');
      const invites = await familyService.getInvites(FAMILY_ID);
      setFamilyInvites(invites);
      familyDataCache.current.lastInvitesFetch = now;
    } catch (err) {
      console.error('[App] Failed to load family invites:', err);
    }
  }, [userId, getRefreshInterval]);

  // Automatically join family when user signs in
  useEffect(() => {
    const joinFamily = async () => {
      if (!userId) return;
      
      try {
        // Only check membership once
        if (!familyDataCache.current.membershipChecked) {
          const displayName = auth.currentUser?.displayName || `User-${userId.substring(0, 6)}`;
          const isMember = await familyService.isMember(FAMILY_ID, userId);
          
          if (!isMember) {
            // Add user to family if not already a member
            const member: FamilyMember = {
              userId,
              displayName,
              joinedAt: Date.now()
            };
            await familyService.addMember(FAMILY_ID, member);
            console.log(`Added user ${userId} to family ${FAMILY_ID}`);
          }
          
          familyDataCache.current.membershipChecked = true;
        }
        
        // Load initial data
        await loadFamilyMembers(true);
        await loadFamilyInvites(true);
        
        setFamilyInitialized(true);
        // Welcome popup removed
      } catch (err) {
        console.error('[App] Failed to join family:', err);
      }
    };
    
    joinFamily();
  }, [userId, loadFamilyMembers, loadFamilyInvites]);
  
  // Set up periodic refresh for family data (less frequent in dev/test)
  useEffect(() => {
    if (!userId || !familyInitialized) return;
    
    const refreshInterval = getRefreshInterval();
    console.log(`[App] Setting up periodic refresh every ${refreshInterval/1000} seconds`);
    
    const refreshTimer = setInterval(() => {
      loadFamilyMembers();
      loadFamilyInvites();
    }, refreshInterval);
    
    return () => clearInterval(refreshTimer);
  }, [userId, familyInitialized, loadFamilyMembers, loadFamilyInvites, getRefreshInterval]);

  // Use QR code signaling (no server required)
  const signaling = useMemo<ISignalingService | null>(() => {
    if (!userId) return null;
    return createQrSignalingService(userId);
  }, [userId]);

  // Log that QR code signaling is enabled
  useEffect(() => {
    if (!userId) return;
    console.log('qr_signaling_enabled');
  }, [userId]);

  // Track online status of peers based on P2P presence
  const [onlineStatus, setOnlineStatus] = useState<Record<string, boolean>>({});

  // P2P
  const { connectTo, disconnectFrom, send, connections, broadcastPresence } = useP2P(userId ?? '', signaling, {
    onMessage: (buf) => {
      console.log(`[App] Received message of ${buf.byteLength} bytes`);
      chat.onIncoming(buf);
    },
    onConnectionState: (peerId: string, state: RTCPeerConnectionState) => {
      console.log(`[App] Connection state changed for ${peerId}: ${state}`);
      
      // When connection state changes, update our presence
      if (state === 'connected') {
        // Broadcast our online status to all peers when a new connection is established
        setTimeout(() => broadcastPresence(true), 500); // Small delay to ensure connection is ready
      }
    },
    onPresenceUpdate: (peerId: string, isOnline: boolean) => {
      console.log(`[App] Presence update from ${peerId}: ${isOnline ? 'online' : 'offline'}`);
      setOnlineStatus(prev => ({
        ...prev,
        [peerId]: isOnline
      }));
    }
  });
  
  // Auto-connect to family members
  useEffect(() => {
    const autoConnectToFamily = async () => {
      if (!userId || !familyInitialized || !signaling) {
        console.log('[App] Not auto-connecting - missing userId, initialization, or signaling');
        return;
      }
      
      try {
        // Connect to all family members except self
        for (const member of familyMembers) {
          if (member.userId !== userId && member.userId) {
            console.log(`Auto-connecting to family member: ${member.displayName} (${member.userId})`);
            try {
              await connectTo(member.userId);
              console.log(`Successfully initiated connection to ${member.userId}`);
            } catch (connErr) {
              console.error(`Failed to connect to ${member.userId}:`, connErr);
            }
          }
        }
      } catch (err) {
        console.error('Error auto-connecting to family members:', err);
      }
    };
    
    autoConnectToFamily();
  }, [userId, familyInitialized, familyMembers, connectTo, signaling]);

  // Chat
  const displayName = auth.currentUser?.displayName ?? userId ?? 'Unknown';
  const chat = useChat(userId ?? '', displayName, null, crypto, (bytes) => {
    console.log(`[App] Broadcasting message of ${bytes.byteLength} bytes to ${Object.keys(connections).length} peers`);
    send(bytes);
  });

  const [copied, setCopied] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [authError, setAuthError] = useState('');
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);
  const [copiedPassword, setCopiedPassword] = useState(false);

  const handleSendMessage = (text: string) => {
    console.log(`[App] Sending message: ${text}`);
    chat.sendMessage(text);
  };

  // Family invitation handlers
  const handleInvite = useCallback(async (invite: FamilyInvite) => {
    if (!userId) return;
    
    try {
      // Extract invite data and send the invite
      await familyService.inviteToFamily(
        FAMILY_ID,
        invite.inviterId,
        invite.inviterName,
        invite.inviteeId,
        invite.inviteeName
      );
      
      // Refresh invites list
      const updatedInvites = await familyService.getInvites(FAMILY_ID);
      setFamilyInvites(updatedInvites);
    } catch (err) {
      console.error('Failed to create invitation:', err);
      throw err;
    }
  }, [userId]);

  const handleApproveInvite = useCallback(async (inviteId: string) => {
    if (!userId) return;
    
    try {
      // Approve the invite
      await familyService.approveInvite(FAMILY_ID, inviteId, userId);
      
      // Check if this was the last approval needed
      const updatedInvites = await familyService.getInvites(FAMILY_ID);
      const approvedInvite = updatedInvites.find(inv => inv.inviteId === inviteId);
      
      if (approvedInvite && approvedInvite.approvals.length === familyMembers.length) {
        // All members have approved, add the invitee to the family
        const newMember: FamilyMember = {
          userId: approvedInvite.inviteeId,
          displayName: approvedInvite.inviteeName,
          joinedAt: Date.now()
        };
        
        await familyService.addMember(FAMILY_ID, newMember);
        await familyService.completeInvite(FAMILY_ID, inviteId);
        
        // Refresh family members and invites
        const members = await familyService.getMembers(FAMILY_ID);
        setFamilyMembers(members);
      }
      
      // Refresh invites list
      const latestInvites = await familyService.getInvites(FAMILY_ID);
      setFamilyInvites(latestInvites);
    } catch (err) {
      console.error('Failed to approve invitation:', err);
      throw err;
    }
  }, [userId, familyMembers.length]);

  const handleRejectInvite = useCallback(async (inviteId: string) => {
    if (!userId) return;
    
    try {
      // Reject the invite
      await familyService.rejectInvite(FAMILY_ID, inviteId);
      
      // Refresh invites list
      const updatedInvites = await familyService.getInvites(FAMILY_ID);
      setFamilyInvites(updatedInvites);
    } catch (err) {
      console.error('Failed to reject invitation:', err);
      throw err;
    }
  }, [userId]);

  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error: any) {
      setAuthError(error.message || 'Failed to sign in');
      console.error('Sign-in error:', error);
    }
  };

  const handleEmailSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    try {
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (error: any) {
      setAuthError(error.message || 'Failed to create account');
      console.error('Sign-up error:', error);
    }
  };

  // Function to copy text to clipboard
  const copyToClipboard = (text: string, type: 'email' | 'password') => {
    navigator.clipboard.writeText(text)
      .then(() => {
        if (type === 'email') {
          setCopiedEmail(text);
          setTimeout(() => setCopiedEmail(null), 2000);
        } else {
          setCopiedPassword(true);
          setTimeout(() => setCopiedPassword(false), 2000);
        }
      })
      .catch(err => {
        console.error('Failed to copy: ', err);
      });
  };

  // Function to fill login form with test credentials
  const fillTestCredentials = (email: string, password: string) => {
    setEmail(email);
    setPassword(password);
  };

  if (!userId) {
    return (
      <div style={{ padding: 16, maxWidth: 500, margin: '0 auto' }}>
        <h1>Family Chat POC</h1>
        
        {/* Test Accounts Information */}
        <div style={{ 
          marginBottom: 20, 
          padding: 15, 
          backgroundColor: '#f0f8ff', 
          borderRadius: 5,
          border: '1px solid #cce5ff'
        }}>
          <h3 style={{ marginTop: 0, color: '#0066cc' }}>📋 Test Accounts</h3>
          
          <div style={{ marginBottom: 10 }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: 8,
              padding: 8,
              backgroundColor: '#e6f2ff',
              borderRadius: 4
            }}>
              <div>
                <strong>User A:</strong> test1@user.com
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button 
                  type="button" 
                  onClick={() => copyToClipboard('test1@user.com', 'email')}
                  style={{ 
                    padding: '4px 8px', 
                    backgroundColor: copiedEmail === 'test1@user.com' ? '#4CAF50' : '#f1f1f1',
                    color: copiedEmail === 'test1@user.com' ? 'white' : 'black',
                    border: 'none', 
                    borderRadius: 4,
                    cursor: 'pointer'
                  }}
                >
                  {copiedEmail === 'test1@user.com' ? '✓ Copied' : 'Copy Email'}
                </button>
                <button 
                  type="button" 
                  onClick={() => fillTestCredentials('test1@user.com', 'password123')}
                  style={{ 
                    padding: '4px 8px', 
                    backgroundColor: '#0066cc',
                    color: 'white',
                    border: 'none', 
                    borderRadius: 4,
                    cursor: 'pointer'
                  }}
                >
                  Fill Form
                </button>
              </div>
            </div>
            
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              padding: 8,
              backgroundColor: '#e6f2ff',
              borderRadius: 4
            }}>
              <div>
                <strong>User B:</strong> test2@user.com
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button 
                  type="button" 
                  onClick={() => copyToClipboard('test2@user.com', 'email')}
                  style={{ 
                    padding: '4px 8px', 
                    backgroundColor: copiedEmail === 'test2@user.com' ? '#4CAF50' : '#f1f1f1',
                    color: copiedEmail === 'test2@user.com' ? 'white' : 'black',
                    border: 'none', 
                    borderRadius: 4,
                    cursor: 'pointer'
                  }}
                >
                  {copiedEmail === 'test2@user.com' ? '✓ Copied' : 'Copy Email'}
                </button>
                <button 
                  type="button" 
                  onClick={() => fillTestCredentials('test2@user.com', 'password123')}
                  style={{ 
                    padding: '4px 8px', 
                    backgroundColor: '#0066cc',
                    color: 'white',
                    border: 'none', 
                    borderRadius: 4,
                    cursor: 'pointer'
                  }}
                >
                  Fill Form
                </button>
              </div>
            </div>
          </div>
          
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            padding: 8,
            backgroundColor: '#e6f2ff',
            borderRadius: 4
          }}>
            <div>
              <strong>Password (both accounts):</strong> password123
            </div>
            <button 
              type="button" 
              onClick={() => copyToClipboard('password123', 'password')}
              style={{ 
                padding: '4px 8px', 
                backgroundColor: copiedPassword ? '#4CAF50' : '#f1f1f1',
                color: copiedPassword ? 'white' : 'black',
                border: 'none', 
                borderRadius: 4,
                cursor: 'pointer'
              }}
            >
              {copiedPassword ? '✓ Copied' : 'Copy Password'}
            </button>
          </div>
          
          <p style={{ fontSize: '0.85em', marginTop: 10, color: '#666' }}>
            <strong>Note:</strong> These accounts are for testing purposes only. Use the Copy buttons or Fill Form to quickly populate the login form.
          </p>
        </div>
        
        <div style={{ marginBottom: 20 }}>
          <form onSubmit={isSigningUp ? handleEmailSignUp : handleEmailSignIn}>

            <div style={{ marginBottom: 10 }}>
              <label style={{ display: 'block', marginBottom: 5 }}>Email:</label>
              <input 
                type="email" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
                required
              />
            </div>
            
            <div style={{ marginBottom: 15 }}>
              <label style={{ display: 'block', marginBottom: 5 }}>Password:</label>
              <input 
                type="password" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
                required
              />
            </div>
            
            {authError && (
              <div style={{ color: 'red', marginBottom: 10 }}>{authError}</div>
            )}
            
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
              <button 
                type="submit" 
                style={{ 
                  padding: '8px 16px',
                  backgroundColor: '#4CAF50',
                  color: 'white',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                  flex: '1'
                }}
              >
                {isSigningUp ? 'Sign Up' : 'Sign In'}
              </button>
              <button 
                type="button" 
                onClick={() => setIsSigningUp(!isSigningUp)}
                style={{ 
                  padding: '8px 16px',
                  backgroundColor: '#f1f1f1',
                  border: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                  flex: '1'
                }}
              >
                {isSigningUp ? 'Switch to Sign In' : 'Switch to Sign Up'}
              </button>
            </div>
          </form>
        </div>
        
        <div style={{ marginTop: 20, borderTop: '1px solid #ccc', paddingTop: 20 }}>
          <p style={{ textAlign: 'center', marginBottom: 10 }}>Or sign in with:</p>
          <button 
            onClick={() => signInWithPopup(auth, provider)}
            style={{ 
              width: '100%', 
              padding: '8px 16px',
              backgroundColor: '#4285F4',
              color: 'white',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              fontSize: '16px'
            }}
          >
            <span style={{ fontWeight: 'bold' }}>G</span> Sign In With Google
          </button>
        </div>

        <div style={{ marginTop: 20, fontSize: 14, color: '#666' }}>
          <p>Test accounts:</p>
          <ul>
            <li>test1@user.com / testuser1</li>
            <li>test2@user.com / testuser2</li>
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-container">
      {/* Navigation - More prominent tabs */}
      <div className="app-navigation" style={{ 
        display: 'flex', 
        borderBottom: '2px solid #ddd', 
        marginBottom: '20px', 
        padding: '0 0 0px 0'
      }}>
        <button 
          className={`nav-button ${activePage === 'connections' ? 'active' : ''}`}
          onClick={() => setActivePage('connections')}
          style={{ 
            flex: 1, 
            padding: '15px 20px', 
            fontSize: '16px', 
            fontWeight: activePage === 'connections' ? 'bold' : 'normal',
            backgroundColor: activePage === 'connections' ? '#f0f8ff' : 'transparent',
            borderBottom: activePage === 'connections' ? '3px solid #4a90e2' : 'none',
            margin: '0 5px',
            borderRadius: '8px 8px 0 0'
          }}
        >
          Connections & Status
        </button>
        <button 
          className={`nav-button ${activePage === 'messaging' ? 'active' : ''}`}
          onClick={() => setActivePage('messaging')}
          style={{ 
            flex: 1, 
            padding: '15px 20px', 
            fontSize: '16px', 
            fontWeight: activePage === 'messaging' ? 'bold' : 'normal',
            backgroundColor: activePage === 'messaging' ? '#f0f8ff' : 'transparent',
            borderBottom: activePage === 'messaging' ? '3px solid #4a90e2' : 'none',
            margin: '0 5px',
            borderRadius: '8px 8px 0 0',
            position: 'relative'
          }}
        >
          Messaging
          {Object.values(onlineStatus).filter(Boolean).length > 0 && (
            <span className="badge" style={{
              position: 'absolute',
              top: '8px',
              right: '8px',
              backgroundColor: '#4a90e2',
              color: 'white',
              borderRadius: '50%',
              width: '20px',
              height: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '12px'
            }}>{Object.values(onlineStatus).filter(Boolean).length}</span>
          )}
        </button>
      </div>
      
      {/* Connection Status at top of app - always visible */}
      {userId && (
        <ConnectionStatus 
          userId={userId}
          familyMembers={familyMembers}
          connections={connections}
          onlineStatus={onlineStatus}
          pendingInvites={familyInvites}
        />
      )}
      
      {/* Content changes based on active page */}
      {activePage === 'connections' ? (
        <>
          <section style={{ marginBottom: 16 }}>
        <p>
            Signed in as: {userId}{' '}
            <button
              title="Copy UID"
              aria-label="Copy UID"
              style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}
              onClick={() => {
                navigator.clipboard.writeText(userId ?? '');
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >📋</button>
            {copied && <span style={{ marginLeft: 4, fontSize: 12 }}>Copied!</span>}
          </p>
        <div>
          <p><strong>Family: {FAMILY_ID}</strong> ({familyMembers.length} members)</p>
          <button 
            onClick={() => setShowInviteForm(!showInviteForm)}
            className="toggle-invite-btn"
          >
            {showInviteForm ? 'Hide Invite Form' : 'Invite New Family Member'}
          </button>
        </div>
        
        {showInviteForm && userId && (
          <div className="invite-section">
            <FamilyInviteForm
              familyId={FAMILY_ID}
              inviterId={userId}
              inviterName={auth.currentUser?.displayName || `User-${userId.substring(0, 6)}`}
              onInvite={handleInvite}
            />
          </div>
        )}
        
        {familyInvites.length > 0 && (
          <div className="pending-invites-section">
            <PendingInvites
              invites={familyInvites}
              currentUserId={userId || ''}
              familyMembers={familyMembers}
              onApprove={handleApproveInvite}
              onReject={handleRejectInvite}
            />
          </div>
        )}
        
        <div className="connect-section" style={{ marginTop: '20px' }}>
          <h3>Connection Setup</h3>
          {userId && signaling && (
            <QrSignaling 
              signaling={signaling}
              onConnect={connectTo}
              onDisconnect={disconnectFrom}
            />
          )}
        </div>

      {/* Connection status list */}
      {Object.keys(connections).length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h3>Connections</h3>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {Object.entries(connections).map(([pid, state]) => {
              const isOnline = onlineStatus[pid] || false;
              return (
                <li key={pid} style={{ marginBottom: 4 }}>
                  <span style={{ marginRight: 8 }}>
                    {pid.slice(0, 6)}… – {state}
                    <span 
                      style={{ 
                        display: 'inline-block',
                        width: '10px',
                        height: '10px',
                        borderRadius: '50%',
                        backgroundColor: isOnline ? '#4caf50' : '#aaa',
                        marginLeft: '5px',
                        marginRight: '5px'
                      }} 
                      title={isOnline ? 'Online' : 'Offline'} 
                    />
                    {isOnline ? 'Online' : 'Offline'}
                  </span>
                  {state === 'connected' && (
                    <button onClick={() => disconnectFrom(pid)}>Disconnect</button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      </section>

      {/* Connection Page Content */}
      <div className="content-container">
        <div className="connection-settings">
          <QrSignaling 
            signaling={signaling} 
            onConnect={connectTo}
            onDisconnect={disconnectFrom}
          />
        </div>
      </div>
      </>
      ) : (
      <>
      {/* Messaging Page Content */}
      <div className="content-container">
        <div className="messaging-section">
          {/* Message list */}
          <section data-testid="message-list" className="messages">
            {chat.messages.map(m => (
              <div key={m.id} className={`msg ${m.authorId === userId ? 'me' : 'other'}`}>
                <small>{new Date(m.createdAt).toLocaleTimeString()}</small>
                <div className="author-name">{m.authorName}</div>
                <div className="bubble">{m.body}</div>
              </div>
            ))}
          </section>
          
          {/* Message composer */}
          <Composer onSend={handleSendMessage} disabled={Object.values(connections).every(s => s !== 'connected')} />
        </div>

        <div className="right-panel">
          <div className="interactive-area">
            <h3>Interactive Features</h3>
            <p>Additional interactive features will be added here in future updates.</p>
          </div>
        </div>
      </div>
      </>
      )}
    </div>
  );
};

const Composer: React.FC<{ onSend: (t: string) => void; disabled?: boolean }> = ({ onSend, disabled = false }) => {
  const [text, setText] = useState('');
  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        if (text.trim()) {
          onSend(text.trim());
          setText('');
        }
      }}
      style={{ display: 'flex', gap: 8 }}
    >
      <input
        data-testid="message-input"
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Type a message"
        style={{ flex: 1 }}
        disabled={disabled}
      />
      <button data-testid="send-btn" type="submit" disabled={disabled || !text.trim()}>Send</button>
    </form>
  );
};

export default App;
