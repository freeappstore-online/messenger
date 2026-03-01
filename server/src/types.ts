export interface PlainMessage {
  id: string;
  authorId: string;
  authorName: string;
  convId: string;
  body: string;
  createdAt: number;
}

export interface ChannelPost {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: number;
}

export type SignalPayload =
  | { type: 'offer'; sdp: RTCSessionDescriptionInit; connectionId?: string }
  | { type: 'answer'; sdp: RTCSessionDescriptionInit; connectionId?: string }
  | { type: 'ice'; candidate: RTCIceCandidateInit; connectionId?: string };

// Client -> Server
export type ClientMessage =
  | { type: 'chat'; to: string; convId: string; message: PlainMessage }
  | { type: 'chat_group'; convId: string; message: PlainMessage }
  | { type: 'channel_post'; channelId: string; post: ChannelPost }
  | { type: 'signal'; to: string; payload: SignalPayload }
  | { type: 'sync'; since: number }
  | { type: 'channel_relay'; channelId: string; postId: string; relayedTo: string[] };

// Server -> Client
export type ServerMessage =
  | { type: 'chat'; from: string; convId: string; message: PlainMessage }
  | { type: 'signal'; from: string; payload: SignalPayload }
  | { type: 'presence'; userId: string; online: boolean }
  | { type: 'sync'; messages: PlainMessage[] }
  | { type: 'channel_post'; channelId: string; post: ChannelPost }
  | { type: 'channel_relay_request'; channelId: string; post: ChannelPost; targets: string[] }
  | { type: 'ack'; messageId: string };
