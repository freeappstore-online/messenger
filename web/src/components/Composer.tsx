import { useState, useRef, useCallback } from 'react';
import { SendHorizontal } from 'lucide-react';

interface Props {
  onSend: (text: string) => void;
  onTyping?: () => void;
}

export function Composer({ onSend, onTyping }: Props) {
  const [text, setText] = useState('');
  const lastTypingRef = useRef(0);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setText(e.target.value);
    if (onTyping) {
      const now = Date.now();
      if (now - lastTypingRef.current > 2000) {
        lastTypingRef.current = now;
        onTyping();
      }
    }
  }, [onTyping]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText('');
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 px-3 py-2 border-t border-gray-800 bg-gray-900">
      <input
        type="text"
        value={text}
        onChange={handleChange}
        onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) handleSubmit(e); }}
        placeholder="Type a message..."
        className="flex-1 px-3 py-2.5 border border-gray-700 rounded-full bg-gray-800 text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
      />
      <button type="submit" className="p-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full transition-colors">
        <SendHorizontal size={20} />
      </button>
    </form>
  );
}
