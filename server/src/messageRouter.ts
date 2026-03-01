import type { ClientMessage, ServerMessage } from './types.js';
import { sendTo } from './presence.js';
import { saveMessage, getConversationMembers, getMessagesSince, getUserConversations } from './firestore.js';

export async function routeMessage(fromUserId: string, msg: ClientMessage) {
  switch (msg.type) {
    case 'chat':
      return handleChat(fromUserId, msg);
    case 'chat_group':
      return handleGroupChat(fromUserId, msg);
    case 'signal':
      return handleSignal(fromUserId, msg);
    case 'sync':
      return handleSync(fromUserId, msg);
  }
}

async function handleChat(
  fromUserId: string,
  msg: Extract<ClientMessage, { type: 'chat' }>
) {
  // Persist
  await saveMessage(msg.message);

  // Deliver to recipient
  sendTo(msg.to, {
    type: 'chat',
    from: fromUserId,
    convId: msg.convId,
    message: msg.message,
  });

  // Ack to sender
  sendTo(fromUserId, { type: 'ack', messageId: msg.message.id });
}

async function handleGroupChat(
  fromUserId: string,
  msg: Extract<ClientMessage, { type: 'chat_group' }>
) {
  // Persist
  await saveMessage(msg.message);

  // Fan out to all members except sender
  const members = await getConversationMembers(msg.convId);
  for (const memberId of members) {
    if (memberId !== fromUserId) {
      sendTo(memberId, {
        type: 'chat',
        from: fromUserId,
        convId: msg.convId,
        message: msg.message,
      });
    }
  }

  // Ack to sender
  sendTo(fromUserId, { type: 'ack', messageId: msg.message.id });
}

function handleSignal(
  fromUserId: string,
  msg: Extract<ClientMessage, { type: 'signal' }>
) {
  sendTo(msg.to, {
    type: 'signal',
    from: fromUserId,
    payload: msg.payload,
  });
}

async function handleSync(
  fromUserId: string,
  msg: Extract<ClientMessage, { type: 'sync' }>
) {
  const convIds = await getUserConversations(fromUserId);
  const allMessages = [];
  for (const convId of convIds) {
    const msgs = await getMessagesSince(convId, msg.since);
    allMessages.push(...msgs);
  }
  allMessages.sort((a, b) => a.createdAt - b.createdAt);
  sendTo(fromUserId, { type: 'sync', messages: allMessages });
}
