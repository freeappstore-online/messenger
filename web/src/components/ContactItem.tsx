import type { Contact } from '@famchat/shared';

interface Props {
  contact: Contact;
  online: boolean;
  onClick: () => void;
  onDelete: () => void;
}

export function ContactItem({ contact, online, onClick, onDelete }: Props) {
  return (
    <div className="flex items-center px-4 py-3 border-b border-gray-800">
      <div className="flex-1 cursor-pointer" onClick={onClick}>
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            {online && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />}
            <span className={`relative inline-flex h-2 w-2 rounded-full ${online ? 'bg-green-500' : 'bg-gray-600'}`} />
          </span>
          <span className="font-semibold text-sm text-gray-100">{contact.displayName}</span>
        </div>
        <p className="mt-1 text-xs text-gray-500">{contact.email}</p>
      </div>
      <button
        onClick={onDelete}
        className="border border-red-500 text-red-500 rounded-lg px-3 py-1 text-xs hover:bg-red-500/10 transition-colors"
      >
        Remove
      </button>
    </div>
  );
}
