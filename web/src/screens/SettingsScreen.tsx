import type { User } from 'firebase/auth';

interface Props {
  user: User;
  logout: () => void;
}

export function SettingsScreen({ user, logout }: Props) {
  return (
    <div style={{ padding: 24 }}>
      <h2 style={{ fontSize: 20, marginBottom: 16 }}>Settings</h2>
      <div style={{ marginBottom: 24 }}>
        <p><strong>Email:</strong> {user.email}</p>
        <p><strong>Name:</strong> {user.displayName || '(not set)'}</p>
        <p style={{ fontSize: 12, color: '#888' }}><strong>UID:</strong> {user.uid}</p>
      </div>
      <button onClick={logout} style={logoutBtn}>Sign Out</button>
    </div>
  );
}

const logoutBtn: React.CSSProperties = {
  padding: '10px 24px', background: '#ff3b30', color: '#fff',
  border: 'none', borderRadius: 8, fontSize: 15, cursor: 'pointer',
};
