import { useState, useRef, useCallback } from 'react';
import { ImagePlus, SendHorizontal } from 'lucide-react';

interface Props {
  onSend: (text: string) => void;
  onTyping?: () => void;
  onSendImage?: (file: File) => void;
}

export function Composer({ onSend, onTyping, onSendImage }: Props) {
  const [text, setText] = useState('');
  const lastTypingRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handlePickImage = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onSendImage) {
      onSendImage(file);
    }
    e.target.value = '';
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2 px-3 py-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] border-t border-gray-800 bg-gray-900">
      {onSendImage && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            type="button"
            onClick={handlePickImage}
            className="p-2.5 text-emerald-400 hover:text-emerald-300 border border-gray-700 rounded-full transition-colors"
            aria-label="Send image"
            title="Send image"
          >
            <ImagePlus size={20} />
          </button>
        </>
      )}
      <input
        type="text"
        value={text}
        onChange={handleChange}
        onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) handleSubmit(e); }}
        placeholder="Type a message or paste a link/photo URL..."
        className="flex-1 px-3 py-2.5 border border-gray-700 rounded-full bg-gray-800 text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
      />
      <button type="submit" className="p-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full transition-colors">
        <SendHorizontal size={20} />
      </button>
    </form>
  );
}
