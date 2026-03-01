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
    <form onSubmit={handleSubmit} style={formStyle}>
      <input
        type="text"
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Type a message..."
        style={inputStyle}
      />
      <button type="submit" style={btnStyle}>Send</button>
    </form>
  );
}

const formStyle: React.CSSProperties = {
  display: 'flex', gap: 8, padding: '8px 12px',
  borderTop: '1px solid #eee', background: '#fff',
};

const inputStyle: React.CSSProperties = {
  flex: 1, padding: '10px 12px', border: '1px solid #ccc',
  borderRadius: 20, fontSize: 15, outline: 'none',
};

const btnStyle: React.CSSProperties = {
  padding: '10px 20px', background: '#007aff', color: '#fff',
  border: 'none', borderRadius: 20, fontSize: 15, cursor: 'pointer',
};
