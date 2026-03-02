interface EncryptedPayload {
  v: 1;
  iv: string;
  ct: string;
}

const IDENTITY_KEY_STORAGE = 'famchat_e2ee_identity_v1';
const PEER_KEY_STORAGE = 'famchat_e2ee_peer_keys_v1';
const CURVE = 'P-256';

let identityPromise: Promise<CryptoKeyPair> | null = null;
let peerJwkLoaded = false;

const peerJwkById = new Map<string, JsonWebKey>();
const peerPublicKeyById = new Map<string, CryptoKey>();
const sharedKeyById = new Map<string, CryptoKey>();

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function loadPeerJwksFromStorage(): void {
  if (peerJwkLoaded) return;
  peerJwkLoaded = true;
  try {
    const raw = localStorage.getItem(PEER_KEY_STORAGE);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, JsonWebKey>;
    for (const [peerId, jwk] of Object.entries(parsed)) {
      peerJwkById.set(peerId, jwk);
    }
  } catch {
    // Ignore malformed storage.
  }
}

function persistPeerJwks(): void {
  const payload: Record<string, JsonWebKey> = {};
  for (const [peerId, jwk] of peerJwkById.entries()) {
    payload[peerId] = jwk;
  }
  localStorage.setItem(PEER_KEY_STORAGE, JSON.stringify(payload));
}

async function importIdentityFromStorage(raw: string): Promise<CryptoKeyPair | null> {
  try {
    const parsed = JSON.parse(raw) as { publicKey?: JsonWebKey; privateKey?: JsonWebKey };
    if (!parsed.publicKey || !parsed.privateKey) return null;
    const [publicKey, privateKey] = await Promise.all([
      crypto.subtle.importKey('jwk', parsed.publicKey, { name: 'ECDH', namedCurve: CURVE }, true, []),
      crypto.subtle.importKey('jwk', parsed.privateKey, { name: 'ECDH', namedCurve: CURVE }, true, ['deriveKey']),
    ]);
    return { publicKey, privateKey };
  } catch {
    return null;
  }
}

async function generateAndStoreIdentity(): Promise<CryptoKeyPair> {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: CURVE },
    true,
    ['deriveKey'],
  );
  const [publicKey, privateKey] = await Promise.all([
    crypto.subtle.exportKey('jwk', pair.publicKey),
    crypto.subtle.exportKey('jwk', pair.privateKey),
  ]);
  localStorage.setItem(IDENTITY_KEY_STORAGE, JSON.stringify({ publicKey, privateKey }));
  return pair;
}

async function getIdentityKeyPair(): Promise<CryptoKeyPair> {
  if (identityPromise) return identityPromise;
  identityPromise = (async () => {
    const raw = localStorage.getItem(IDENTITY_KEY_STORAGE);
    if (raw) {
      const imported = await importIdentityFromStorage(raw);
      if (imported) return imported;
    }
    return generateAndStoreIdentity();
  })();
  return identityPromise;
}

export async function getIdentityPublicJwk(): Promise<JsonWebKey> {
  const pair = await getIdentityKeyPair();
  return crypto.subtle.exportKey('jwk', pair.publicKey);
}

async function getPeerPublicKey(peerId: string): Promise<CryptoKey | null> {
  loadPeerJwksFromStorage();
  const cached = peerPublicKeyById.get(peerId);
  if (cached) return cached;

  const jwk = peerJwkById.get(peerId);
  if (!jwk) return null;
  try {
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDH', namedCurve: CURVE }, true, []);
    peerPublicKeyById.set(peerId, key);
    return key;
  } catch {
    return null;
  }
}

export async function rememberPeerPublicKey(peerId: string, publicKey: Record<string, unknown>): Promise<void> {
  loadPeerJwksFromStorage();
  const jwk = publicKey as JsonWebKey;
  peerJwkById.set(peerId, jwk);
  peerPublicKeyById.delete(peerId);
  sharedKeyById.delete(peerId);
  persistPeerJwks();
  await getPeerPublicKey(peerId);
}

async function getSharedKey(peerId: string): Promise<CryptoKey | null> {
  const cached = sharedKeyById.get(peerId);
  if (cached) return cached;
  const peerPublic = await getPeerPublicKey(peerId);
  if (!peerPublic) return null;

  const identity = await getIdentityKeyPair();
  try {
    const shared = await crypto.subtle.deriveKey(
      { name: 'ECDH', public: peerPublic },
      identity.privateKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt'],
    );
    sharedKeyById.set(peerId, shared);
    return shared;
  } catch {
    return null;
  }
}

export function isEncryptedPayload(value: unknown): value is EncryptedPayload {
  if (typeof value !== 'object' || !value) return false;
  const record = value as Record<string, unknown>;
  return record.v === 1 && typeof record.iv === 'string' && typeof record.ct === 'string';
}

export async function encryptForPeer(peerId: string, plaintext: string): Promise<EncryptedPayload | null> {
  const key = await getSharedKey(peerId);
  if (!key) return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
  return {
    v: 1,
    iv: bytesToBase64(iv),
    ct: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

export async function decryptFromPeer(peerId: string, payload: EncryptedPayload): Promise<string | null> {
  const key = await getSharedKey(peerId);
  if (!key) return null;
  try {
    const iv = base64ToBytes(payload.iv);
    const ciphertext = base64ToBytes(payload.ct);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return new TextDecoder().decode(new Uint8Array(plain));
  } catch {
    return null;
  }
}
