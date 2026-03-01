/**
 * Utilities for P2P connections and WebRTC handling
 */

/**
 * Sanitizes a string by removing whitespace and restricting the length
 * 
 * @param s - The string to sanitize
 * @returns The sanitized string
 */
export function sanitizeId(s: string): string {
  return s?.trim?.()?.substring(0, 64) || '';
}

/**
 * Generates a unique connection ID for a peer connection
 * 
 * @param peerId - The ID of the peer
 * @param type - The type of connection (manual or auto)
 * @returns A unique connection ID
 */
export function generateConnectionId(peerId: string, type: 'auto' | 'manual' = 'auto'): string {
  const timestamp = Date.now();
  const randomPart = Math.random().toString(36).substring(2, 8);
  return `${peerId}-${type}-${timestamp}-${randomPart}`;
}

/**
 * Message types for P2P communication
 */
export const MESSAGE_TYPE = {
  CHAT: 0, // Regular chat message
  PRESENCE: 1, // Presence/status update
} as const;

// Type for P2P messages
export type P2PMessageType = (typeof MESSAGE_TYPE)[keyof typeof MESSAGE_TYPE];

// Message format for P2P messages
export interface P2PMessage {
  type: P2PMessageType;
  payload: any;
}

// Presence update message
export interface PresenceMessage {
  userId: string;
  isOnline: boolean;
  timestamp: number;
}

// Information about a peer connection
export interface PeerInfo {
  id: string; // The ID of the peer
  connectionId: string; // Unique ID for this specific connection
  connectionType: 'auto' | 'manual'; // Whether this was auto-connected or manually connected
  pc: RTCPeerConnection;
  ch?: RTCDataChannel;
  pendingCandidates?: RTCIceCandidateInit[];
  makingOffer: boolean;
  settingRemoteAnswer: boolean;
  polite: boolean;
  lastProcessedOfferSdp?: string;
  lastProcessedAnswerSdp?: string;
  isOnline: boolean;
}

/**
 * Options for the P2PManager instance
 */
export interface P2PManagerOptions {
  /** Fired whenever a data-channel message arrives. */
  onMessage: (peerId: string, bytes: ArrayBuffer) => void;
  /** Fired whenever a peer connection state changes (connecting, connected, etc.) */
  onConnectionState?: (peerId: string, state: RTCPeerConnectionState) => void;
  /** Fired when the data channel open event fires (useful for UI) */
  onDataChannelOpen?: (peerId: string) => void;
  /** Fired when a peer is connected successfully */
  onConnected?: (peerId: string) => void;
  /** Fired when a peer is disconnected */
  onDisconnected?: (peerId: string) => void;
  /** Fired when presence information is received about other peers */
  onPresenceUpdate?: (peerId: string, isOnline: boolean) => void;
  /** Custom ICE servers to use for WebRTC connections */
  iceServers?: RTCIceServer[];
}
