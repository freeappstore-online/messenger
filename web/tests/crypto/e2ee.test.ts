import { describe, expect, it, beforeEach } from 'vitest';
import {
  __resetE2EETestState,
  decryptFromPeer,
  encryptForPeer,
  getIdentityPublicJwk,
  isEncryptedPayload,
  rememberPeerPublicKey,
} from '../../src/crypto/e2ee';

async function makeRandomPublicJwk(): Promise<Record<string, unknown>> {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey'],
  );
  const publicKey = await crypto.subtle.exportKey('jwk', pair.publicKey);
  return publicKey as Record<string, unknown>;
}

describe('e2ee', () => {
  beforeEach(() => {
    localStorage.clear();
    __resetE2EETestState();
  });

  it('encrypts and decrypts payload for a remembered peer', async () => {
    const selfPublic = await getIdentityPublicJwk();
    await rememberPeerPublicKey('peer-a', selfPublic as Record<string, unknown>);

    const encrypted = await encryptForPeer('peer-a', 'hello encrypted world');
    expect(encrypted).not.toBeNull();
    expect(isEncryptedPayload(encrypted)).toBe(true);

    const plain = await decryptFromPeer('peer-a', encrypted!);
    expect(plain).toBe('hello encrypted world');
  });

  it('fails to decrypt when peer key changes', async () => {
    const selfPublic = await getIdentityPublicJwk();
    await rememberPeerPublicKey('peer-a', selfPublic as Record<string, unknown>);
    const encrypted = await encryptForPeer('peer-a', 'secret');
    expect(encrypted).not.toBeNull();

    const wrongPublic = await makeRandomPublicJwk();
    await rememberPeerPublicKey('peer-a', wrongPublic);
    const plain = await decryptFromPeer('peer-a', encrypted!);
    expect(plain).toBeNull();
  });

  it('loads peer key material from localStorage after in-memory reset', async () => {
    const selfPublic = await getIdentityPublicJwk();
    await rememberPeerPublicKey('peer-a', selfPublic as Record<string, unknown>);
    __resetE2EETestState();

    const encrypted = await encryptForPeer('peer-a', 'persisted');
    expect(encrypted).not.toBeNull();
    const plain = await decryptFromPeer('peer-a', encrypted!);
    expect(plain).toBe('persisted');
  });
});
