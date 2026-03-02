import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(),
}));

vi.mock('../contacts.js', () => ({
  getUserContacts: vi.fn().mockResolvedValue(new Set<string>()),
}));

import { addUser, removeUser, isOnline, sendTo } from '../presence.js';
import { getUserContacts } from '../contacts.js';

function makeWs() {
  return { readyState: 1, OPEN: 1, send: vi.fn(), on: vi.fn() } as any;
}

const dummyWs = makeWs();
beforeEach(() => {
  vi.clearAllMocks();
  // Reset module state — pass a dummy ws that won't match, forcing cleanup
  // We use addUser + removeUser with the same ws to ensure cleanup
  for (const id of ['u1', 'u2', 'contact1']) {
    addUser(id, dummyWs);
    removeUser(id, dummyWs);
  }
});

describe('presence', () => {
  it('addUser registers user, isOnline returns true', () => {
    addUser('u1', makeWs());
    expect(isOnline('u1')).toBe(true);
  });

  it('removeUser makes isOnline return false', () => {
    const ws = makeWs();
    addUser('u1', ws);
    removeUser('u1', ws);
    expect(isOnline('u1')).toBe(false);
  });

  it('sendTo returns false for offline users', () => {
    expect(sendTo('nobody', { type: 'ack', messageId: '1' })).toBe(false);
  });

  it('sendTo returns true and sends JSON for online users', () => {
    const ws = makeWs();
    addUser('u1', ws);
    const msg = { type: 'ack' as const, messageId: 'm1' };
    expect(sendTo('u1', msg)).toBe(true);
    expect(ws.send).toHaveBeenCalledWith(JSON.stringify(msg));
  });

  it('presence change notifies contacts only', async () => {
    const contactWs = makeWs();
    addUser('contact1', contactWs);

    vi.mocked(getUserContacts).mockResolvedValue(new Set(['contact1']));

    addUser('u1', makeWs());
    // Wait for async notifyContacts
    await vi.waitFor(() => {
      expect(contactWs.send).toHaveBeenCalled();
    });

    const sent = JSON.parse(contactWs.send.mock.calls.at(-1)[0]);
    expect(sent).toEqual({ type: 'presence', userId: 'u1', online: true });
  });
});
