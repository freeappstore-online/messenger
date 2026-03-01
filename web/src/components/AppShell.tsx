import { useLocation, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

const tabs = [
  { path: '/', label: 'Chats' },
  { path: '/channels', label: 'Channels' },
  { path: '/contacts', label: 'Contacts' },
  { path: '/settings', label: 'Settings' },
];

export function AppShell({ children }: Props) {
  const location = useLocation();
  const navigate = useNavigate();

  // Hide bottom nav on chat detail screens
  const hideNav = location.pathname.startsWith('/chat/') || location.pathname.startsWith('/channel/');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh' }}>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {children}
      </div>
      {!hideNav && (
        <nav style={navStyle}>
          {tabs.map(t => {
            const active = location.pathname === t.path;
            return (
              <button
                key={t.path}
                onClick={() => navigate(t.path)}
                style={{ ...tabBtn, color: active ? '#007aff' : '#8e8e93' }}
              >
                {t.label}
              </button>
            );
          })}
        </nav>
      )}
    </div>
  );
}

const navStyle: React.CSSProperties = {
  display: 'flex', borderTop: '1px solid #eee', background: '#fff',
};

const tabBtn: React.CSSProperties = {
  flex: 1, padding: '10px 0', background: 'none', border: 'none',
  fontSize: 13, fontWeight: 600, cursor: 'pointer',
};
