import Dexie, { type Table } from 'dexie';
import type { ChannelPost, MessageAttachment, MessageReactions, PlainMessage } from '@famchat/shared';

export interface MessageRecord {
  id: string;
  convId: string; // alphabetically sorted uid1:uid2
  authorId: string;
  authorName: string;
  body: string;
  createdAt: number;
  attachments?: MessageAttachment[];
  reactions?: MessageReactions;
}

export interface ChannelPostRecord extends ChannelPost {
  channelId: string;
}

export interface PendingDirectMessageRecord {
  id: string; // message id
  peerId: string;
  convId: string;
  createdAt: number;
  message: PlainMessage;
}

export interface PendingChannelPostRecord {
  id: string; // post id
  channelId: string;
  createdAt: number;
  post: ChannelPost;
  sentTo: string[];
}

class ChatDB extends Dexie {
  messages!: Table<MessageRecord, string>;
  channelPosts!: Table<ChannelPostRecord, string>;
  pendingDirectMessages!: Table<PendingDirectMessageRecord, string>;
  pendingChannelPosts!: Table<PendingChannelPostRecord, string>;

  constructor() {
    super('family_chat_v1');
    this.version(1).stores({
      messages: '&id, convId, createdAt'
    });
    this.version(2).stores({
      messages: '&id, convId, createdAt'
    });
    this.version(3).stores({
      messages: '&id, convId, createdAt',
      channelPosts: '&id, channelId, createdAt',
    });
    this.version(4).stores({
      messages: '&id, convId, createdAt',
      channelPosts: '&id, channelId, createdAt',
      pendingDirectMessages: '&id, peerId, convId, createdAt',
      pendingChannelPosts: '&id, channelId, createdAt',
    });
  }
}

export const chatDB = new ChatDB();

export async function getChannelPosts(
  channelId: string,
  sinceTimestamp?: number,
  limit = 100,
): Promise<ChannelPost[]> {
  let q = chatDB.channelPosts.where('channelId').equals(channelId);
  if (sinceTimestamp) {
    q = q.and(p => p.createdAt > sinceTimestamp);
  }
  const records = await q.sortBy('createdAt');
  return records.slice(-limit).map((record) => ({
    id: record.id,
    authorId: record.authorId,
    authorName: record.authorName,
    body: record.body,
    createdAt: record.createdAt,
  }));
}

export async function putChannelPost(channelId: string, post: ChannelPost): Promise<void> {
  await chatDB.channelPosts.put({ ...post, channelId });
}

export async function putChannelPosts(channelId: string, posts: ChannelPost[]): Promise<void> {
  if (posts.length === 0) return;
  await chatDB.channelPosts.bulkPut(posts.map(p => ({ ...p, channelId })));
}

export async function queuePendingDirectMessage(peerId: string, message: PlainMessage): Promise<void> {
  await chatDB.pendingDirectMessages.put({
    id: message.id,
    peerId,
    convId: message.convId,
    createdAt: message.createdAt,
    message,
  });
}

export async function getPendingDirectMessagesForPeer(peerId: string): Promise<PendingDirectMessageRecord[]> {
  return chatDB.pendingDirectMessages.where('peerId').equals(peerId).sortBy('createdAt');
}

export async function removePendingDirectMessage(messageId: string): Promise<void> {
  await chatDB.pendingDirectMessages.delete(messageId);
}

export async function queuePendingChannelPost(channelId: string, post: ChannelPost): Promise<void> {
  const existing = await chatDB.pendingChannelPosts.get(post.id);
  await chatDB.pendingChannelPosts.put({
    id: post.id,
    channelId,
    createdAt: post.createdAt,
    post,
    sentTo: existing?.sentTo ?? [],
  });
}

export async function getPendingChannelPosts(channelId: string): Promise<PendingChannelPostRecord[]> {
  return chatDB.pendingChannelPosts.where('channelId').equals(channelId).sortBy('createdAt');
}

export async function markPendingChannelPostSentTo(postId: string, peerId: string): Promise<void> {
  const existing = await chatDB.pendingChannelPosts.get(postId);
  if (!existing) return;
  if (existing.sentTo.includes(peerId)) return;
  await chatDB.pendingChannelPosts.update(postId, {
    sentTo: [...existing.sentTo, peerId],
  });
}
