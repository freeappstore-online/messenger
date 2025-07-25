import Dexie, { Table } from 'dexie';

export interface MessageRecord {
  id: string;
  convId: string; // alphabetically sorted uid1:uid2
  authorId: string;
  body: string;
  createdAt: number;
}

class ChatDB extends Dexie {
  messages!: Table<MessageRecord, string>;

  constructor() {
    super('family_chat_v1');
    this.version(1).stores({
      messages: '&id, convId, createdAt'
    });
  }
}

export const chatDB = new ChatDB();
