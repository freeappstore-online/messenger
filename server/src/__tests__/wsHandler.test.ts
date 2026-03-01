import { describe, it, expect, vi } from 'vitest';

vi.mock('firebase-admin/firestore', () => ({ getFirestore: vi.fn() }));
vi.mock('../presence.js', () => ({ addUser: vi.fn(), removeUser: vi.fn(), sendTo: vi.fn() }));
vi.mock('../presenceContacts.js', () => ({ sendContactPresence: vi.fn() }));
vi.mock('../messageRouter.js', () => ({ routeMessage: vi.fn() }));
vi.mock('../channelFanout.js', () => ({ handleChannelPost: vi.fn(), handleRelayReport: vi.fn(), removeP2PTracking: vi.fn() }));
vi.mock('../firestore.js', () => ({ ensureUser: vi.fn() }));

import { createRateLimiter } from '../wsHandler.js';

describe('rate limiter', () => {
  it('allows messages up to burst limit', () => {
    const limiter = createRateLimiter();
    for (let i = 0; i < 20; i++) {
      expect(limiter()).toBe(true);
    }
  });

  it('rejects messages after burst exhaustion', () => {
    const limiter = createRateLimiter();
    for (let i = 0; i < 20; i++) {
      limiter();
    }
    expect(limiter()).toBe(false);
  });

  it('refills over time', () => {
    const limiter = createRateLimiter();
    for (let i = 0; i < 20; i++) {
      limiter();
    }
    expect(limiter()).toBe(false);

    const originalNow = Date.now;
    let fakeTime = originalNow();
    vi.spyOn(Date, 'now').mockImplementation(() => fakeTime);

    // Advance 1 second → should refill 10 tokens
    fakeTime += 1000;
    let allowed = 0;
    for (let i = 0; i < 15; i++) {
      if (limiter()) allowed++;
    }
    expect(allowed).toBe(10);

    Date.now = originalNow;
    vi.restoreAllMocks();
  });
});
