export interface PlainMessage {
  id: string;
  authorId: string;
  familyId: string;
  body: string;
  createdAt: number;
}

const KEY_PREFIX = 'familychat_msgs_';

export function conversationId(a: string, b: string) {
  return [a, b].sort().join(':');
}

export function loadMessages(convId: string): PlainMessage[] {
  const raw = localStorage.getItem(KEY_PREFIX + convId);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as PlainMessage[];
  } catch { return []; }
}

export function saveMessages(convId: string, msgs: PlainMessage[]) {
  localStorage.setItem(KEY_PREFIX + convId, JSON.stringify(msgs));
}
