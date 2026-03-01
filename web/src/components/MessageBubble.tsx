interface Props {
  body: string;
  authorName: string;
  isMine: boolean;
  time: number;
}

function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?';
}

export function MessageBubble({ body, authorName, isMine, time }: Props) {
  return (
    <div className={`flex items-end gap-2 mb-2 ${isMine ? 'flex-row-reverse' : ''}`}>
      {!isMine && (
        <div className="w-7 h-7 rounded-full bg-emerald-900/30 flex items-center justify-center text-emerald-300 text-[10px] font-bold shrink-0">
          {getInitials(authorName)}
        </div>
      )}
      <div className={`max-w-[75%] px-3 py-2 rounded-xl ${isMine ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-gray-100'}`}>
        {!isMine && <div className="text-[11px] font-semibold mb-0.5 text-gray-400">{authorName}</div>}
        <div className="text-sm break-words">{body}</div>
        <div className="text-[10px] opacity-70 text-right mt-0.5">
          {new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );
}
