export interface PlainMessage {
  id: string;
  authorId: string;
  familyId: string;
  body: string;
  createdAt: number;
}

const KEY_PREFIX = 'familychat_msgs_';

export function loadMessages(familyId: string): PlainMessage[] {
  const raw = localStorage.getItem(KEY_PREFIX + familyId);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as PlainMessage[];
  } catch { return []; }
}

export function saveMessages(familyId: string, msgs: PlainMessage[]) {
  localStorage.setItem(KEY_PREFIX + familyId, JSON.stringify(msgs));
}
