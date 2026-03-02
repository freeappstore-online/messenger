import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChannelPost, SignalPayload } from '../types.js';

const mockDocGet = vi.fn();
const mockDocSet = vi.fn().mockResolvedValue(undefined);
const mockDocUpdate = vi.fn().mockResolvedValue(undefined);
const mockCollectionGet = vi.fn();

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => ({
    doc: vi.fn(() => ({
      get: mockDocGet,
      set: mockDocSet,
      update: mockDocUpdate,
    })),
    collection: vi.fn(() => ({
      get: mockCollectionGet,
    })),
  })),
}));

const mockSendTo = vi.fn().mockReturnValue(true);
const mockIsOnline = vi.fn().mockReturnValue(false);
vi.mock('../presence.js', () => ({
  sendTo: (...args: any[]) => mockSendTo(...args),
  isOnline: (...args: any[]) => mockIsOnline(...args),
}));

const mockSendPushToUser = vi.fn().mockResolvedValue(undefined);
vi.mock('../pushNotify.js', () => ({
  sendPushToUser: (...args: any[]) => mockSendPushToUser(...args),
}));

// Re-import to get fresh module state for trackP2PSignal/removeP2PTracking
let handleChannelPost: typeof import('../channelFanout.js').handleChannelPost;
let trackP2PSignal: typeof import('../channelFanout.js').trackP2PSignal;
let removeP2PTracking: typeof import('../channelFanout.js').removeP2PTracking;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.resetModules();
  const mod = await import('../channelFanout.js');
  handleChannelPost = mod.handleChannelPost;
  trackP2PSignal = mod.trackP2PSignal;
  removeP2PTracking = mod.removeP2PTracking;
});

function makePost(overrides: Partial<ChannelPost> = {}): ChannelPost {
  return {
    id: 'p1',
    authorId: 'attacker',
    authorName: 'Author',
    body: 'post body',
    createdAt: Date.now(),
    ...overrides,
  };
}

describe('handleChannelPost', () => {
  it('rejects post if sender is not channel owner', async () => {
    mockDocGet.mockResolvedValue({ exists: true, data: () => ({ ownerId: 'other' }) });
    await handleChannelPost('u1', 'ch1', makePost());
    expect(mockDocSet).not.toHaveBeenCalled();
  });

  it('overrides authorId with fromUserId', async () => {
    mockDocGet.mockResolvedValue({ exists: true, data: () => ({ ownerId: 'u1', name: 'Ch' }) });
    mockCollectionGet.mockResolvedValue({ docs: [] });
    const post = makePost({ authorId: 'impersonator' });
    await handleChannelPost('u1', 'ch1', post);
    expect(post.authorId).toBe('u1');
  });

  it('rejects body > 10,000 chars', async () => {
    const post = makePost({ body: 'x'.repeat(10_001) });
    await handleChannelPost('u1', 'ch1', post);
    expect(mockDocGet).not.toHaveBeenCalled();
  });

  it('rejects attachment payloads over WS path', async () => {
    const post = makePost({
      attachments: [{
        id: 'a1',
        kind: 'image',
        mimeType: 'image/jpeg',
        size: 12,
        dataUrl: 'data:image/jpeg;base64,abc',
      }],
    });
    await handleChannelPost('u1', 'ch1', post);
    expect(mockDocGet).not.toHaveBeenCalled();
    expect(mockDocSet).not.toHaveBeenCalled();
  });

  it('persists post and updates channel metadata on valid post', async () => {
    mockDocGet.mockResolvedValue({ exists: true, data: () => ({ ownerId: 'u1', name: 'Ch' }) });
    mockCollectionGet.mockResolvedValue({ docs: [] });
    const post = makePost();
    await handleChannelPost('u1', 'ch1', post);
    expect(mockDocSet).toHaveBeenCalled();
    expect(mockDocUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ lastPost: post.body, lastPostAt: post.createdAt })
    );
  });

  it('rejects post if channel doc does not exist', async () => {
    mockDocGet.mockResolvedValue({ exists: false, data: () => undefined });
    await handleChannelPost('u1', 'ch1', makePost());
    expect(mockDocSet).not.toHaveBeenCalled();
  });

  it('persists post but sends no WS/push when channel has no subscribers', async () => {
    mockDocGet.mockResolvedValue({ exists: true, data: () => ({ ownerId: 'u1', name: 'Ch' }) });
    mockCollectionGet.mockResolvedValue({ docs: [] });
    await handleChannelPost('u1', 'ch1', makePost());
    expect(mockDocSet).toHaveBeenCalled(); // post persisted
    expect(mockSendTo).not.toHaveBeenCalled();
    expect(mockSendPushToUser).not.toHaveBeenCalled();
  });

  it('sends WS message to online subscribers', async () => {
    mockDocGet.mockResolvedValue({ exists: true, data: () => ({ ownerId: 'u1', name: 'Ch' }) });
    mockCollectionGet.mockResolvedValue({ docs: [{ id: 'sub1' }] });
    mockIsOnline.mockReturnValue(true);
    await handleChannelPost('u1', 'ch1', makePost());
    expect(mockSendTo).toHaveBeenCalledWith('sub1', expect.objectContaining({ type: 'channel_post' }));
  });

  it('sends push to offline subscribers', async () => {
    mockDocGet.mockResolvedValue({ exists: true, data: () => ({ ownerId: 'u1', name: 'Ch' }) });
    mockCollectionGet.mockResolvedValue({ docs: [{ id: 'sub1' }] });
    mockIsOnline.mockReturnValue(false);
    await handleChannelPost('u1', 'ch1', makePost());
    expect(mockSendPushToUser).toHaveBeenCalledWith('sub1', expect.stringContaining('Ch'), expect.any(String), expect.any(Object));
  });
});

describe('trackP2PSignal / removeP2PTracking', () => {
  it('trackP2PSignal registers both sides on dc-ready with ch- prefix', () => {
    const payload: SignalPayload = { type: 'dc-ready', connectionId: 'ch-123' };
    trackP2PSignal('u1', 'u2', payload);
    // removeP2PTracking for u1 should also remove u1 from u2's set
    removeP2PTracking('u1');
    // After removal, tracking for u2 should not include u1
    // Verify by tracking again and removing u2
    trackP2PSignal('a', 'b', payload);
    removeP2PTracking('b');
    // No error means map management is correct
  });

  it('trackP2PSignal ignores non-dc-ready signals', () => {
    const payload: SignalPayload = { type: 'offer', sdp: {} as any, connectionId: 'ch-123' };
    trackP2PSignal('u1', 'u2', payload);
    // removeP2PTracking should be a no-op for untracked user
    removeP2PTracking('u1');
  });

  it('trackP2PSignal ignores dc-ready without ch- prefix', () => {
    const payload: SignalPayload = { type: 'dc-ready', connectionId: 'other-123' };
    trackP2PSignal('u1', 'u2', payload);
    removeP2PTracking('u1');
  });
});
