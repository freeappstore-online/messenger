import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PlainMessage } from '../types.js';

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(),
}));

const mockSendTo = vi.fn().mockReturnValue(true);
vi.mock('../presence.js', () => ({
  sendTo: (...args: any[]) => mockSendTo(...args),
}));

const mockSaveMessage = vi.fn().mockResolvedValue(undefined);
const mockGetConversationMembers = vi.fn().mockResolvedValue([]);
const mockGetMessagesSince = vi.fn().mockResolvedValue([]);
const mockGetUserConversations = vi.fn().mockResolvedValue([]);
const mockToggleMessageReaction = vi.fn().mockResolvedValue({});
vi.mock('../firestore.js', () => ({
  saveMessage: (...args: any[]) => mockSaveMessage(...args),
  getConversationMembers: (...args: any[]) => mockGetConversationMembers(...args),
  getMessagesSince: (...args: any[]) => mockGetMessagesSince(...args),
  getUserConversations: (...args: any[]) => mockGetUserConversations(...args),
  toggleMessageReaction: (...args: any[]) => mockToggleMessageReaction(...args),
}));

const mockIsContact = vi.fn().mockResolvedValue(false);
vi.mock('../contacts.js', () => ({
  isContact: (...args: any[]) => mockIsContact(...args),
}));

const mockSendPushToUser = vi.fn().mockResolvedValue(undefined);
vi.mock('../pushNotify.js', () => ({
  sendPushToUser: (...args: any[]) => mockSendPushToUser(...args),
}));

const mockTrackP2PSignal = vi.fn();
vi.mock('../channelFanout.js', () => ({
  trackP2PSignal: (...args: any[]) => mockTrackP2PSignal(...args),
}));

import { routeMessage } from '../messageRouter.js';

function makeMsg(overrides: Partial<PlainMessage> = {}): PlainMessage {
  return {
    id: 'm1',
    authorId: 'attacker',
    authorName: 'User',
    convId: 'conv1',
    body: 'hello',
    createdAt: Date.now(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSendTo.mockReturnValue(true);
});

describe('routeMessage — chat', () => {
  it('rejects chat if sender not a conversation member', async () => {
    mockGetConversationMembers.mockResolvedValue(['other', 'u2']);
    await routeMessage('u1', { type: 'chat', to: 'u2', convId: 'conv1', message: makeMsg() });
    expect(mockSaveMessage).not.toHaveBeenCalled();
  });

  it('rejects chat if recipient not a conversation member', async () => {
    mockGetConversationMembers.mockResolvedValue(['u1', 'other']);
    await routeMessage('u1', { type: 'chat', to: 'u2', convId: 'conv1', message: makeMsg() });
    expect(mockSaveMessage).not.toHaveBeenCalled();
  });

  it('rejects chat body > 10,000 chars', async () => {
    mockGetConversationMembers.mockResolvedValue(['u1', 'u2']);
    const msg = makeMsg({ body: 'x'.repeat(10_001) });
    await routeMessage('u1', { type: 'chat', to: 'u2', convId: 'conv1', message: msg });
    expect(mockSaveMessage).not.toHaveBeenCalled();
  });

  it('overrides authorId with verified fromUserId', async () => {
    mockGetConversationMembers.mockResolvedValue(['u1', 'u2']);
    const msg = makeMsg({ authorId: 'impersonator' });
    await routeMessage('u1', { type: 'chat', to: 'u2', convId: 'conv1', message: msg });
    expect(mockSaveMessage).toHaveBeenCalledWith(expect.objectContaining({ authorId: 'u1' }));
  });

  it('saves message and delivers to online recipient', async () => {
    mockGetConversationMembers.mockResolvedValue(['u1', 'u2']);
    mockSendTo.mockReturnValue(true);
    await routeMessage('u1', { type: 'chat', to: 'u2', convId: 'conv1', message: makeMsg() });
    expect(mockSaveMessage).toHaveBeenCalled();
    expect(mockSendTo).toHaveBeenCalledWith('u2', expect.objectContaining({ type: 'chat' }));
  });

  it('rejects chat with non-string body', async () => {
    mockGetConversationMembers.mockResolvedValue(['u1', 'u2']);
    const msg = makeMsg({ body: 42 as any });
    await routeMessage('u1', { type: 'chat', to: 'u2', convId: 'conv1', message: msg });
    expect(mockSaveMessage).not.toHaveBeenCalled();
  });

  it('accepts chat body exactly 10,000 chars', async () => {
    mockGetConversationMembers.mockResolvedValue(['u1', 'u2']);
    const msg = makeMsg({ body: 'x'.repeat(10_000) });
    await routeMessage('u1', { type: 'chat', to: 'u2', convId: 'conv1', message: msg });
    expect(mockSaveMessage).toHaveBeenCalled();
  });

  it('sends push when recipient is offline', async () => {
    mockGetConversationMembers.mockResolvedValue(['u1', 'u2']);
    mockSendTo.mockImplementation((_userId: string, msg: any) => {
      // Return false for recipient delivery, true for ack
      return msg.type === 'ack';
    });
    await routeMessage('u1', { type: 'chat', to: 'u2', convId: 'conv1', message: makeMsg() });
    expect(mockSendPushToUser).toHaveBeenCalledWith('u2', 'New message', expect.any(String), expect.any(Object));
  });
});

describe('routeMessage — chat_group', () => {
  it('rejects non-members', async () => {
    mockGetConversationMembers.mockResolvedValue(['other1', 'other2']);
    await routeMessage('u1', { type: 'chat_group', convId: 'conv1', message: makeMsg() });
    expect(mockSaveMessage).not.toHaveBeenCalled();
  });

  it('rejects body > 10,000 chars', async () => {
    mockGetConversationMembers.mockResolvedValue(['u1', 'u2']);
    const msg = makeMsg({ body: 'x'.repeat(10_001) });
    await routeMessage('u1', { type: 'chat_group', convId: 'conv1', message: msg });
    expect(mockSaveMessage).not.toHaveBeenCalled();
  });

  it('overrides authorId with verified fromUserId', async () => {
    mockGetConversationMembers.mockResolvedValue(['u1', 'u2']);
    const msg = makeMsg({ authorId: 'impersonator' });
    await routeMessage('u1', { type: 'chat_group', convId: 'conv1', message: msg });
    expect(mockSaveMessage).toHaveBeenCalledWith(expect.objectContaining({ authorId: 'u1' }));
  });

  it('sends push to offline members', async () => {
    mockGetConversationMembers.mockResolvedValue(['u1', 'u2', 'u3']);
    mockSendTo.mockImplementation((_userId: string, msg: any) => msg.type === 'ack');
    await routeMessage('u1', { type: 'chat_group', convId: 'conv1', message: makeMsg() });
    expect(mockSendPushToUser).toHaveBeenCalledTimes(2); // u2 and u3
  });

  it('fans out to all members except sender', async () => {
    mockGetConversationMembers.mockResolvedValue(['u1', 'u2', 'u3']);
    await routeMessage('u1', { type: 'chat_group', convId: 'conv1', message: makeMsg() });
    expect(mockSaveMessage).toHaveBeenCalled();
    // Should send to u2 and u3 but not u1 (except ack)
    const chatCalls = mockSendTo.mock.calls.filter(
      (call) => call[1].type === 'chat'
    );
    expect(chatCalls.map((call) => call[0]).sort()).toEqual(['u2', 'u3']);
  });
});

describe('routeMessage — signal', () => {
  it('rejects if users are not contacts', async () => {
    mockIsContact.mockResolvedValue(false);
    await routeMessage('u1', {
      type: 'signal',
      to: 'u2',
      payload: { type: 'offer', sdp: {} as any },
    });
    expect(mockSendTo).not.toHaveBeenCalled();
  });

  it('delivers signal to valid contact', async () => {
    mockIsContact.mockResolvedValue(true);
    const payload = { type: 'offer' as const, sdp: {} as any };
    await routeMessage('u1', { type: 'signal', to: 'u2', payload });
    expect(mockTrackP2PSignal).toHaveBeenCalledWith('u1', 'u2', payload);
    expect(mockSendTo).toHaveBeenCalledWith('u2', expect.objectContaining({ type: 'signal', from: 'u1' }));
  });
});

describe('routeMessage — chat_reaction', () => {
  it('rejects reactions from non-members', async () => {
    mockGetConversationMembers.mockResolvedValue(['u2', 'u3']);
    await routeMessage('u1', { type: 'chat_reaction', convId: 'conv1', messageId: 'm1', emoji: '👍' });
    expect(mockToggleMessageReaction).not.toHaveBeenCalled();
  });

  it('rejects invalid emoji payloads', async () => {
    mockGetConversationMembers.mockResolvedValue(['u1', 'u2']);
    await routeMessage('u1', { type: 'chat_reaction', convId: 'conv1', messageId: 'm1', emoji: '' });
    expect(mockToggleMessageReaction).not.toHaveBeenCalled();
  });

  it('broadcasts updated reactions to conversation members', async () => {
    mockGetConversationMembers.mockResolvedValue(['u1', 'u2']);
    mockToggleMessageReaction.mockResolvedValue({ '👍': ['u1'] });
    await routeMessage('u1', { type: 'chat_reaction', convId: 'conv1', messageId: 'm1', emoji: '👍' });
    expect(mockToggleMessageReaction).toHaveBeenCalledWith('conv1', 'm1', 'u1', '👍');
    expect(mockSendTo).toHaveBeenCalledWith('u1', expect.objectContaining({ type: 'message_reaction', messageId: 'm1' }));
    expect(mockSendTo).toHaveBeenCalledWith('u2', expect.objectContaining({ type: 'message_reaction', messageId: 'm1' }));
  });

  it('does not broadcast when reaction update is rejected', async () => {
    mockGetConversationMembers.mockResolvedValue(['u1', 'u2']);
    mockToggleMessageReaction.mockResolvedValue(null);
    await routeMessage('u1', { type: 'chat_reaction', convId: 'conv1', messageId: 'm1', emoji: '👍' });
    const reactionCalls = mockSendTo.mock.calls.filter((call) => call[1].type === 'message_reaction');
    expect(reactionCalls).toHaveLength(0);
  });
});

describe('routeMessage — sync', () => {
  it('sends empty sync when user has no conversations', async () => {
    mockGetUserConversations.mockResolvedValue([]);
    await routeMessage('u1', { type: 'sync', since: 0 });
    const syncCall = mockSendTo.mock.calls.find((call) => call[1].type === 'sync');
    expect(syncCall).toBeDefined();
    expect(syncCall![1].messages).toEqual([]);
  });

  it('caps at 1000 messages total', async () => {
    mockGetUserConversations.mockResolvedValue(['conv1', 'conv2']);
    const msgs = Array.from({ length: 600 }, (_, i) => ({
      id: `m${i}`,
      authorId: 'u1',
      authorName: 'User',
      convId: 'conv1',
      body: 'hi',
      createdAt: i,
    }));
    mockGetMessagesSince.mockResolvedValue(msgs);
    await routeMessage('u1', { type: 'sync', since: 0 });

    const syncCall = mockSendTo.mock.calls.find((call) => call[1].type === 'sync');
    expect(syncCall).toBeDefined();
    expect(syncCall![1].messages.length).toBeLessThanOrEqual(1000);
  });
});
