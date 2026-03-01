import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGet = vi.fn();

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => ({
    collection: vi.fn(() => ({ get: mockGet })),
  })),
}));

// We need to reset the module-level cache between tests
let getUserContacts: typeof import('../contacts.js').getUserContacts;
let isContact: typeof import('../contacts.js').isContact;

beforeEach(async () => {
  vi.clearAllMocks();
  // Re-import to reset the cache Map
  vi.resetModules();
  const mod = await import('../contacts.js');
  getUserContacts = mod.getUserContacts;
  isContact = mod.isContact;
});

describe('contacts', () => {
  it('getUserContacts fetches from Firestore and returns Set of contact IDs', async () => {
    mockGet.mockResolvedValue({
      docs: [{ id: 'c1' }, { id: 'c2' }],
    });
    const result = await getUserContacts('u1');
    expect(result).toEqual(new Set(['c1', 'c2']));
  });

  it('getUserContacts returns cached results on second call', async () => {
    mockGet.mockResolvedValue({ docs: [{ id: 'c1' }] });
    await getUserContacts('u1');
    await getUserContacts('u1');
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('isContact returns true for known contacts, false otherwise', async () => {
    mockGet.mockResolvedValue({ docs: [{ id: 'c1' }] });
    expect(await isContact('u1', 'c1')).toBe(true);
    expect(await isContact('u1', 'c999')).toBe(false);
  });
});
