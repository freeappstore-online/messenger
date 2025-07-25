import React, { useEffect, useMemo, useState } from 'react';
import { auth, db } from './firebase';
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { createFirestoreService } from './services/firestoreService';
import { SignalingService } from './services/signalingService';
import { useP2P } from './rtc/useP2P';
import { useChat } from './chat/useChat';
import { NoopCryptoAdapter } from './crypto/noopCrypto';

const fs = createFirestoreService(db);

const provider = new GoogleAuthProvider(); // easiest for POC

const FAMILY_ID = 'demo-family-1'; // in real app, let users create/join

export const App: React.FC = () => {
  const [userId, setUserId] = useState<string | null>(null);
  const [peerId, setPeerId] = useState('');
  const crypto = useMemo(() => NoopCryptoAdapter, []);

  // auth
  useEffect(() => {
    return onAuthStateChanged(auth, u => setUserId(u?.uid ?? null));
  }, []);

  const signaling = useMemo(() => (userId ? new SignalingService(fs, userId) : null), [userId]);

  // P2P
  const { connectTo, send } = useP2P(userId ?? '', signaling!, {
    onMessage: (buf) => chat.onIncoming(buf)
  });

  // Chat
  const chat = useChat(FAMILY_ID, userId ?? '', crypto, send);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [authError, setAuthError] = useState('');

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

  if (!userId) {
    return (
      <div style={{ padding: 16, maxWidth: 400, margin: '0 auto' }}>
        <h1>Family Chat POC</h1>
        
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
            
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <button type="submit" style={{ padding: '8px 16px' }}>
                {isSigningUp ? 'Sign Up' : 'Sign In'}
              </button>
              <button 
                type="button" 
                onClick={() => setIsSigningUp(!isSigningUp)}
                style={{ padding: '8px 16px' }}
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
            style={{ width: '100%', padding: '8px 16px' }}
          >
            Sign In With Google
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
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 16, fontFamily: 'sans-serif' }}>
      <h1>Family Chat POC</h1>
      <section style={{ marginBottom: 16 }}>
        <p>Signed in as: {userId}</p>
        <input
          data-testid="peer-id-input"
          value={peerId}
          onChange={e => setPeerId(e.target.value)}
          placeholder="Peer UID"
          style={{ width: '100%', marginBottom: 8 }}
        />
        <button data-testid="connect-btn" onClick={() => connectTo(peerId)}>Connect To Peer</button>
      </section>

      <section data-testid="message-list" style={{ border: '1px solid #ccc', padding: 8, height: 300, overflowY: 'auto', marginBottom: 8 }}>
        {chat.messages.map(m => (
          <div key={m.id} style={{ margin: '4px 0', textAlign: m.authorId === userId ? 'right' : 'left' }}>
            <small>{new Date(m.createdAt).toLocaleTimeString()}</small>
            <div
              style={{
                display: 'inline-block',
                padding: '4px 8px',
                borderRadius: 4,
                background: m.authorId === userId ? '#dcf8c6' : '#eee'
              }}
            >
              {m.body}
            </div>
          </div>
        ))}
      </section>

      <Composer onSend={chat.sendMessage} />
    </div>
  );
};

const Composer: React.FC<{ onSend: (t: string) => void }> = ({ onSend }) => {
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
      />
      <button data-testid="send-btn" type="submit">Send</button>
    </form>
  );
};

export default App;
