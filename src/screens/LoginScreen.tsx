import { useState } from 'react';
import type { useAuth } from '../hooks/useAuth';

type AuthAPI = ReturnType<typeof useAuth>;

export function LoginScreen({ loginEmail, loginGoogle }: Pick<AuthAPI, 'loginEmail' | 'loginGoogle'>) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await loginEmail(email, password);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div style={{ maxWidth: 400, margin: '80px auto', padding: 24 }}>
      <h1 style={{ fontSize: 24, marginBottom: 24 }}>Sign In</h1>
      <form onSubmit={handleSubmit}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          style={inputStyle}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          style={inputStyle}
        />
        {error && <p style={{ color: 'red', fontSize: 14 }}>{error}</p>}
        <button type="submit" style={btnStyle}>Sign In</button>
      </form>
      <hr style={{ margin: '24px 0' }} />
      <button onClick={() => loginGoogle()} style={{ ...btnStyle, background: '#4285f4' }}>
        Sign in with Google
      </button>
      <p style={{ marginTop: 16, fontSize: 13, color: '#888' }}>
        Test: test1@user.com / test123 or test2@user.com / test123
      </p>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  display: 'block', width: '100%', padding: '10px 12px',
  marginBottom: 12, border: '1px solid #ccc', borderRadius: 6, fontSize: 15,
  boxSizing: 'border-box',
};

const btnStyle: React.CSSProperties = {
  display: 'block', width: '100%', padding: '10px 12px',
  background: '#333', color: '#fff', border: 'none', borderRadius: 6,
  fontSize: 15, cursor: 'pointer',
};
