import { useState, useEffect } from 'react';
import type { WsClient, ServerMessage } from '../services/wsClient';

export function usePresence(wsClient: WsClient) {
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());

  useEffect(() => {
    return wsClient.onMessage((msg: ServerMessage) => {
      if (msg.type === 'presence') {
        setOnlineUsers(prev => {
          const next = new Set(prev);
          if (msg.online) next.add(msg.userId);
          else next.delete(msg.userId);
          return next;
        });
      }
    });
  }, [wsClient]);

  return onlineUsers;
}
