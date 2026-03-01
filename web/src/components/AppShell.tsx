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

  const hideNav = location.pathname.startsWith('/chat/') || location.pathname.startsWith('/channel/');

  return (
    <div className="flex flex-col h-dvh">
      <div className="flex-1 overflow-auto">
        {children}
      </div>
      {!hideNav && (
        <nav className="flex border-t border-gray-800 bg-gray-900">
          {tabs.map(t => {
            const active = location.pathname === t.path;
            return (
              <button
                key={t.path}
                onClick={() => navigate(t.path)}
                className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${active ? 'text-emerald-400' : 'text-gray-500 hover:text-gray-300'}`}
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
