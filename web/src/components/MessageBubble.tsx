interface Props {
  body: string;
  authorName: string;
  isMine: boolean;
  time: number;
}

export function MessageBubble({ body, authorName, isMine, time }: Props) {
  return (
    <div style={{ display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
      <div style={{
        maxWidth: '75%',
        padding: '8px 12px',
        borderRadius: 12,
        background: isMine ? '#007aff' : '#e9e9eb',
        color: isMine ? '#fff' : '#000',
      }}>
        {!isMine && <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 2 }}>{authorName}</div>}
        <div style={{ fontSize: 15, wordBreak: 'break-word' }}>{body}</div>
        <div style={{ fontSize: 10, opacity: 0.7, textAlign: 'right', marginTop: 2 }}>
          {new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );
}
