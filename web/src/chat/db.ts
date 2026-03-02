import Dexie, { type Table } from 'dexie';
import type { ChannelPost, MessageAttachment, MessageReactions } from '@famchat/shared';

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

class ChatDB extends Dexie {
  messages!: Table<MessageRecord, string>;
  channelPosts!: Table<ChannelPostRecord, string>;

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
