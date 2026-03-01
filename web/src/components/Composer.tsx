import { useState } from 'react';

interface Props {
  onSend: (text: string) => void;
}

export function Composer({ onSend }: Props) {
  const [text, setText] = useState('');

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
        onChange={e => setText(e.target.value)}
        placeholder="Type a message..."
        className="flex-1 px-3 py-2.5 border border-gray-700 rounded-full bg-gray-800 text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
      />
      <button type="submit" className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full text-sm font-medium transition-colors">
        Send
      </button>
    </form>
  );
}
