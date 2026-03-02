import { useLocation, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { MessageCircle, Radio, Users, Settings } from 'lucide-react';
import type { WsClient } from '../services/wsClient';
import { useUnreadCount } from '../hooks/useUnreadCount';

interface Props {
  children: ReactNode;
  wsClient: WsClient;
}

const tabs = [
  { path: '/', label: 'Chats', icon: MessageCircle },
  { path: '/channels', label: 'Channels', icon: Radio },
  { path: '/contacts', label: 'Contacts', icon: Users },
  { path: '/settings', label: 'Settings', icon: Settings },
];

export function AppShell({ children, wsClient }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const { chatCount, channelCount } = useUnreadCount(wsClient);

  const hideNav = location.pathname.startsWith('/chat/') || location.pathname.startsWith('/channel/');

  const badgeFor = (path: string) => {
    const count = path === '/' ? chatCount : path === '/channels' ? channelCount : 0;
    if (count === 0) return null;
    return (
      <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
        {count > 99 ? '99+' : count}
      </span>
    );
  };

  return (
    <div className="flex flex-col h-[var(--app-vh)] overflow-x-hidden">
      <div className="flex-1 overflow-hidden">
        {children}
      </div>
      {!hideNav && (
        <nav className="flex border-t border-gray-800 bg-gray-900 pb-[env(safe-area-inset-bottom)]">
          {tabs.map(t => {
            const active = location.pathname === t.path;
            return (
              <button
                key={t.path}
                onClick={() => navigate(t.path)}
                className={`flex-1 flex flex-col items-center gap-1 py-2.5 transition-colors ${active ? 'text-emerald-400' : 'text-gray-500 hover:text-gray-300'}`}
              >
                <div className="relative">
                  <t.icon size={20} />
                  {badgeFor(t.path)}
                </div>
                <span className="text-[10px] font-semibold">{t.label}</span>
              </button>
            );
          })}
        </nav>
      )}
    </div>
  );
}
