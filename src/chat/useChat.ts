import { useCallback, useState } from 'react';
import { loadMessages, saveMessages } from './localStore';
import type { PlainMessage } from './localStore';
import type { CryptoAdapter } from '../crypto/noopCrypto';

export interface Envelope {
  v: number;
  enc: 'none'; // for now
  payload: ArrayBuffer;
}

export function serializeEnvelope(env: Envelope): ArrayBuffer {
  // simple: [json string] because enc=none. Real impl could pack binary.
  return env.payload;
}

export async function deserializeEnvelope(buf: ArrayBuffer, crypto: CryptoAdapter): Promise<PlainMessage> {
  const plain = await crypto.decrypt(buf);
  return JSON.parse(new TextDecoder().decode(plain)) as PlainMessage;
}

export function useChat(familyId: string, me: string, crypto: CryptoAdapter, sendBytes: (buf: ArrayBuffer)=>void) {
  const [messages, setMessages] = useState<PlainMessage[]>(() => loadMessages(familyId));

  const persist = useCallback((next: PlainMessage[]) => {
    setMessages(next);
    saveMessages(familyId, next);
  }, [familyId]);

  const sendMessage = useCallback(async (body: string) => {
    const msg: PlainMessage = {
      id: crypto.randomUUID?.() ?? Math.random().toString(36).slice(2),
      authorId: me,
      familyId,
      body,
      createdAt: Date.now()
    };
    // store local immediately
    persist([...messages, msg]);

    // send over P2P
    const bytes = new TextEncoder().encode(JSON.stringify(msg));
    const env: Envelope = { v: 1, enc: 'none', payload: await crypto.encrypt(bytes) };
    sendBytes(serializeEnvelope(env));
  }, [messages, me, familyId, crypto, persist, sendBytes]);

  const onIncoming = useCallback(async (buf: ArrayBuffer) => {
    const msg = await deserializeEnvelope(buf, crypto);
    // ignore duplicates
    if (messages.find(m => m.id === msg.id)) return;
    persist([...messages, msg]);
  }, [messages, crypto, persist]);

  return { messages, sendMessage, onIncoming };
}
