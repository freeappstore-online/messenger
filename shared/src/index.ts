// Smart post IDs: {timestamp}-{authorShort8}-{random6}
export function generatePostId(authorId: string): string {
  const ts = Date.now().toString();
  const author = authorId.slice(0, 8);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${ts}-${author}-${rand}`;
}

// P2P channel sync messages (sent over data channels)
export type P2PMessage =
  | { type: 'p2p-channel-post'; channelId: string; post: ChannelPost }
  | { type: 'p2p-channel-sync-request'; channelId: string; sinceTimestamp?: number }
  | { type: 'p2p-channel-sync-response'; channelId: string; posts: ChannelPost[] };

export interface Contact {
  userId: string;
  displayName: string;
  email: string;
  addedAt: number;
}

export interface ContactRequest {
  fromUserId: string;
  fromDisplayName: string;
  fromEmail: string;
  createdAt: number;
}

export interface PlainMessage {
  id: string;
  authorId: string;
  authorName: string;
  convId: string;
  body: string;
  createdAt: number;
  attachments?: MessageAttachment[];
  reactions?: MessageReactions;
}

export interface MessageAttachment {
  id: string;
  kind: 'image';
  mimeType: string;
  fileName?: string;
  size: number;
  dataUrl: string;
}

export type MessageReactions = Record<string, string[]>;

export interface ChannelPost {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: number;
  attachments?: MessageAttachment[];
}

export type SignalPayload =
  | { type: 'offer'; sdp: RTCSessionDescriptionInit; connectionId?: string }
  | { type: 'answer'; sdp: RTCSessionDescriptionInit; connectionId?: string }
  | { type: 'ice'; candidate: RTCIceCandidateInit; connectionId?: string }
  | { type: 'call-offer'; callId: string; media: 'audio' | 'video' }
  | { type: 'call-answer'; callId: string }
  | { type: 'call-reject'; callId: string }
  | { type: 'call-end'; callId: string }
  | { type: 'dc-ready'; connectionId?: string }
  | { type: 'dc-offer'; sdp: RTCSessionDescriptionInit; connectionId?: string }
  | { type: 'dc-answer'; sdp: RTCSessionDescriptionInit; connectionId?: string }
  | { type: 'dc-ice'; candidate: RTCIceCandidateInit; connectionId?: string };

// Client -> Server
export type ClientMessage =
  | { type: 'chat'; to: string; convId: string; message: PlainMessage }
  | { type: 'chat_group'; convId: string; message: PlainMessage }
  | { type: 'chat_reaction'; convId: string; messageId: string; emoji: string }
  | { type: 'channel_post'; channelId: string; post: ChannelPost }
  | { type: 'signal'; to: string; payload: SignalPayload }
  | { type: 'sync'; since: number }
  | { type: 'channel_relay'; channelId: string; postId: string; relayedTo: string[] }
  | { type: 'typing'; to: string; convId: string };

// Server -> Client
export type ServerMessage =
  | { type: 'chat'; from: string; convId: string; message: PlainMessage }
  | { type: 'message_reaction'; convId: string; messageId: string; reactions: MessageReactions; updatedBy: string }
  | { type: 'signal'; from: string; payload: SignalPayload }
  | { type: 'presence'; userId: string; online: boolean }
  | { type: 'sync'; messages: PlainMessage[] }
  | { type: 'channel_post'; channelId: string; post: ChannelPost }
  | { type: 'channel_relay_request'; channelId: string; post: ChannelPost; targets: string[] }
  | { type: 'ack'; messageId: string }
  | { type: 'typing'; from: string; convId: string };
