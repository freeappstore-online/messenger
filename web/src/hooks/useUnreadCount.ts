import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import type { WsClient } from '../services/wsClient';

export function useUnreadCount(wsClient: WsClient) {
  const [chatCount, setChatCount] = useState(0);
  const [channelCount, setChannelCount] = useState(0);
  const location = useLocation();

  // Reset counts when navigating to relevant screens
  useEffect(() => {
    const path = location.pathname;
    if (path === '/' || path.startsWith('/chat/')) {
      setChatCount(0);
    }
    if (path === '/channels' || path.startsWith('/channel/')) {
      setChannelCount(0);
    }
  }, [location.pathname]);

  // Increment counts on incoming messages
  useEffect(() => {
    return wsClient.onMessage((msg) => {
      if (msg.type === 'chat') {
        const path = window.location.pathname;
        if (path !== '/' && !path.startsWith('/chat/')) {
          setChatCount(c => c + 1);
        }
      }
      if (msg.type === 'channel_post') {
        const path = window.location.pathname;
        if (path !== '/channels' && !path.startsWith('/channel/')) {
          setChannelCount(c => c + 1);
        }
      }
    });
  }, [wsClient]);

  return { chatCount, channelCount };
}
