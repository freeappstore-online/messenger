import type { Contact } from '@famchat/shared';
import { Settings2, Trash2 } from 'lucide-react';

interface Props {
  contact: Contact;
  displayName: string;
  online: boolean;
  onClick: () => void;
  onSettings: () => void;
  onDelete: () => void;
}

export function ContactItem({ contact, displayName, online, onClick, onSettings, onDelete }: Props) {
  return (
    <div className="flex items-center px-4 py-3 border-b border-gray-800">
      <div className="flex-1 cursor-pointer" onClick={onClick}>
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            {online && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />}
            <span className={`relative inline-flex h-2 w-2 rounded-full ${online ? 'bg-green-500' : 'bg-gray-600'}`} />
          </span>
          <span className="font-semibold text-sm text-gray-100">{displayName}</span>
        </div>
        <p className="mt-1 text-xs text-gray-500">{contact.email}</p>
      </div>
      <button
        onClick={onSettings}
        className="p-2 text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded-lg transition-colors"
      >
        <Settings2 size={16} />
      </button>
      <button
        onClick={onDelete}
        className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}
