import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCollectionGet = vi.fn();
const mockBatchDelete = vi.fn();
const mockBatchCommit = vi.fn().mockResolvedValue(undefined);

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => ({
    collection: vi.fn(() => ({ get: mockCollectionGet })),
    doc: vi.fn(() => ({})),
    batch: vi.fn(() => ({
      delete: mockBatchDelete,
      commit: mockBatchCommit,
    })),
  })),
}));

const mockSendEachForMulticast = vi.fn();
vi.mock('firebase-admin/messaging', () => ({
  getMessaging: vi.fn(() => ({
    sendEachForMulticast: mockSendEachForMulticast,
  })),
}));

import { sendPushToUser } from '../pushNotify.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('sendPushToUser', () => {
  it('returns early if user has no tokens', async () => {
    mockCollectionGet.mockResolvedValue({ empty: true, docs: [] });
    await sendPushToUser('u1', 'Title', 'Body');
    expect(mockSendEachForMulticast).not.toHaveBeenCalled();
  });

  it('calls sendEachForMulticast with correct token list, title, body, data', async () => {
    mockCollectionGet.mockResolvedValue({
      empty: false,
      docs: [{ id: 'token1' }, { id: 'token2' }],
    });
    mockSendEachForMulticast.mockResolvedValue({ failureCount: 0, responses: [] });

    await sendPushToUser('u1', 'Title', 'Body', { url: '/chat/1', tag: 'chat-1' });

    expect(mockSendEachForMulticast).toHaveBeenCalledWith(
      expect.objectContaining({
        tokens: ['token1', 'token2'],
        notification: { title: 'Title', body: 'Body' },
        data: { url: '/chat/1', tag: 'chat-1' },
      })
    );
  });

  it('deletes invalid tokens after failed sends', async () => {
    mockCollectionGet.mockResolvedValue({
      empty: false,
      docs: [{ id: 'good-token' }, { id: 'bad-token' }],
    });
    mockSendEachForMulticast.mockResolvedValue({
      failureCount: 1,
      responses: [
        { success: true },
        { success: false, error: { code: 'messaging/registration-token-not-registered' } },
      ],
    });

    await sendPushToUser('u1', 'Title', 'Body');

    expect(mockBatchDelete).toHaveBeenCalled();
    expect(mockBatchCommit).toHaveBeenCalled();
  });
});
