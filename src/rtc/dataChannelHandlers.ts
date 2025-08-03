import type { PeerInfo } from './p2pUtils';

/**
 * Sets up all event handlers for a data channel
 * 
 * This includes handling message events, open/close events,
 * and error events on the data channel.
 * 
 * @param peer - The peer information object with data channel
 * @param onMessage - Message handling callback
 * @param opts - Optional handlers for events
 */
export function setupDataChannel(
  peer: PeerInfo,
  onMessage: (peerId: string, bytes: ArrayBuffer) => void,
  onPresenceUpdate?: (peerId: string, isOnline: boolean) => void
) {
  if (!peer.ch) return;

  // Handle message events
  peer.ch.onmessage = (ev) => {
    try {
      const data = ev.data;
      console.log(`[P2PManager] Received message from ${peer.id}, type: ${typeof data}, length: ${data instanceof ArrayBuffer ? data.byteLength : (data?.length || 'unknown')}`);

      // Check if this is a control message (JSON) or regular data
      if (data instanceof ArrayBuffer) {
        try {
          // Try to parse as JSON first (for control messages like presence)
          const decoder = new TextDecoder();
          const jsonStr = decoder.decode(data);
          const message = JSON.parse(jsonStr);

          // Handle presence updates
          if (message.type === 1) { // MESSAGE_TYPE.PRESENCE
            const presenceMsg = message.payload;
            if (onPresenceUpdate) {
              console.log(`[P2PManager] Received presence update from ${peer.id}: ${presenceMsg.isOnline ? 'online' : 'offline'}`);
              onPresenceUpdate(peer.id, presenceMsg.isOnline);
              return; // Don't forward control messages to application
            }
          }
        } catch (jsonError) {
          // Not a JSON message, treat as regular binary message
          console.log("[P2PManager] Not a JSON message, treating as binary data");
        }

        // Forward regular binary messages to the application
        console.log(`[P2PManager] Forwarding binary message to application handler`);
        onMessage(peer.id, data);
      } else {
        console.warn(`[P2PManager] Received non-binary message:`, typeof data);
      }
    } catch (e) {
      console.error("[P2PManager] Error in message handler:", e);
    }
  };

  // Handle open/close events
  peer.ch.onopen = () => {
    console.log(`[P2PManager] Data channel opened with ${peer.id}`);
  };

  peer.ch.onclose = () => {
    console.log(`[P2PManager] Data channel closed with ${peer.id}`);
  };

  peer.ch.onerror = (event) => {
    console.error(`[P2PManager] Data channel error with ${peer.id}:`, event);
  };
}
