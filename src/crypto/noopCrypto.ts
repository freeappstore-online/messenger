export interface CryptoAdapter {
  id: 'none' | 'aes-gcm-v1';
  encrypt(plain: Uint8Array): Promise<ArrayBuffer>;
  decrypt(cipher: ArrayBuffer): Promise<ArrayBuffer>;
  randomUUID?(): string;
}

export const NoopCryptoAdapter: CryptoAdapter = {
  id: 'none',
  async encrypt(plain) { return plain.buffer; },
  async decrypt(cipher) { return cipher; },
  randomUUID() { return crypto.randomUUID(); }
};
