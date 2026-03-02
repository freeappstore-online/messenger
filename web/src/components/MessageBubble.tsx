import type { ReactNode } from 'react';
import type { MessageAttachment, MessageReactions } from '@famchat/shared';

interface Props {
  body: string;
  attachments?: MessageAttachment[];
  reactions?: MessageReactions;
  currentUserId?: string;
  authorName: string;
  isMine: boolean;
  time: number;
  onReact?: (emoji: string) => void;
}

function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '?';
}

const URL_REGEX = /\b((?:https?:\/\/|www\.)[^\s<]+)/gi;
const TRAILING_PUNCT_REGEX = /[),.!?;:]+$/;
const IMAGE_EXT_REGEX = /\.(?:png|jpe?g|gif|webp|bmp)(?:[?#].*)?$/i;
const REACTION_CHOICES = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

function stripTrailingPunctuation(urlText: string): { clean: string; trailing: string } {
  const match = urlText.match(TRAILING_PUNCT_REGEX);
  if (!match) return { clean: urlText, trailing: '' };
  const trailing = match[0];
  return { clean: urlText.slice(0, -trailing.length), trailing };
}

function normalizeUrl(urlText: string): string {
  return urlText.startsWith('www.') ? `https://${urlText}` : urlText;
}

function renderMessageText(body: string, isMine: boolean): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let key = 0;
  let match: RegExpExecArray | null;
  const regex = new RegExp(URL_REGEX);

  while ((match = regex.exec(body)) !== null) {
    const matchStart = match.index;
    const raw = match[0];
    const { clean, trailing } = stripTrailingPunctuation(raw);
    if (!clean) continue;

    if (matchStart > cursor) {
      nodes.push(<span key={`txt-${key++}`}>{body.slice(cursor, matchStart)}</span>);
    }

    const href = normalizeUrl(clean);
    nodes.push(
      <a
        key={`lnk-${key++}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className={`underline break-all ${isMine ? 'text-emerald-100 hover:text-white' : 'text-emerald-300 hover:text-emerald-200'}`}
      >
        {clean}
      </a>
    );
    if (trailing) {
      nodes.push(<span key={`tr-${key++}`}>{trailing}</span>);
    }

    cursor = matchStart + raw.length;
  }

  if (cursor < body.length) {
    nodes.push(<span key={`tail-${key++}`}>{body.slice(cursor)}</span>);
  }

  return nodes.length > 0 ? nodes : [<span key="plain">{body}</span>];
}

function extractImageUrls(body: string): string[] {
  const urls = new Set<string>();
  let match: RegExpExecArray | null;
  const regex = new RegExp(URL_REGEX);

  while ((match = regex.exec(body)) !== null) {
    const raw = match[0];
    const { clean } = stripTrailingPunctuation(raw);
    if (!clean) continue;
    const href = normalizeUrl(clean);
    if (IMAGE_EXT_REGEX.test(href)) urls.add(href);
  }

  return [...urls].slice(0, 3);
}

function getSortedReactionEntries(reactions?: MessageReactions): Array<[string, string[]]> {
  const entries = Object.entries(reactions ?? {}).filter(([, users]) => users.length > 0);
  entries.sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  return entries;
}

export function MessageBubble({ body, attachments, reactions, currentUserId, authorName, isMine, time, onReact }: Props) {
  const imageUrls = extractImageUrls(body);
  const imageAttachments = (attachments ?? []).filter((a) => a.kind === 'image');
  const reactionEntries = getSortedReactionEntries(reactions);

  return (
    <div className={`flex items-end gap-2 mb-2 ${isMine ? 'flex-row-reverse' : ''}`}>
      {!isMine && (
        <div className="w-7 h-7 rounded-full bg-emerald-900/30 flex items-center justify-center text-emerald-300 text-[10px] font-bold shrink-0">
          {getInitials(authorName)}
        </div>
      )}
      <div className={`max-w-[75%] px-3 py-2 rounded-xl ${isMine ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-gray-100'}`}>
        {!isMine && <div className="text-[11px] font-semibold mb-0.5 text-gray-400">{authorName}</div>}
        <div className="text-sm break-words whitespace-pre-wrap">{renderMessageText(body, isMine)}</div>
        {imageAttachments.length > 0 && (
          <div className="mt-2 flex flex-col gap-2">
            {imageAttachments.map((attachment) => (
              <a key={attachment.id} href={attachment.dataUrl} target="_blank" rel="noopener noreferrer">
                <img
                  src={attachment.dataUrl}
                  alt={attachment.fileName || 'Shared photo'}
                  loading="lazy"
                  className="max-h-64 w-full rounded-lg object-cover border border-black/10"
                />
              </a>
            ))}
          </div>
        )}
        {imageUrls.length > 0 && (
          <div className="mt-2 flex flex-col gap-2">
            {imageUrls.map((url) => (
              <a key={url} href={url} target="_blank" rel="noopener noreferrer">
                <img
                  src={url}
                  alt="Shared photo"
                  loading="lazy"
                  className="max-h-64 w-full rounded-lg object-cover border border-black/10"
                />
              </a>
            ))}
          </div>
        )}
        {reactionEntries.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {reactionEntries.map(([emoji, users]) => {
              const mine = !!currentUserId && users.includes(currentUserId);
              return (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => onReact?.(emoji)}
                  className={`px-2 py-0.5 rounded-full text-xs border transition-colors ${
                    mine
                      ? 'border-emerald-300/70 bg-emerald-500/20'
                      : 'border-white/15 bg-black/20'
                  }`}
                >
                  {emoji} {users.length}
                </button>
              );
            })}
          </div>
        )}
        {onReact && (
          <div className="mt-2 flex flex-wrap gap-1">
            {REACTION_CHOICES.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => onReact(emoji)}
                className="w-7 h-7 rounded-full bg-black/20 hover:bg-black/30 transition-colors text-sm"
                aria-label={`React ${emoji}`}
                title={`React ${emoji}`}
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
        <div className="text-[10px] opacity-70 text-right mt-0.5">
          {new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );
}
