import { useEffect, useRef } from 'react';
import type { User } from 'firebase/auth';
import { WsClient } from '../services/wsClient';

// Singleton so multiple components share one connection
let sharedClient: WsClient | null = null;

export function getWsClient(): WsClient {
  if (!sharedClient) sharedClient = new WsClient();
  return sharedClient;
}

export function useWsClient(user: User | null) {
  const clientRef = useRef(getWsClient());

  useEffect(() => {
    if (!user) return;
    const client = clientRef.current;
    client.connect(user);
    return () => client.disconnect();
  }, [user]);

  return clientRef.current;
}
