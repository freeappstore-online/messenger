import { useLocation, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { MessageCircle, Radio, Users, Settings } from 'lucide-react';

interface Props {
  children: ReactNode;
}

const tabs = [
  { path: '/', label: 'Chats', icon: MessageCircle },
  { path: '/channels', label: 'Channels', icon: Radio },
  { path: '/contacts', label: 'Contacts', icon: Users },
  { path: '/settings', label: 'Settings', icon: Settings },
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
        <nav className="flex border-t border-gray-800 bg-gray-900 pb-[env(safe-area-inset-bottom)]">
          {tabs.map(t => {
            const active = location.pathname === t.path;
            return (
              <button
                key={t.path}
                onClick={() => navigate(t.path)}
                className={`flex-1 flex flex-col items-center gap-1 py-2.5 transition-colors ${active ? 'text-emerald-400' : 'text-gray-500 hover:text-gray-300'}`}
              >
                <t.icon size={20} />
                <span className="text-[10px] font-semibold">{t.label}</span>
              </button>
            );
          })}
        </nav>
      )}
    </div>
  );
}
