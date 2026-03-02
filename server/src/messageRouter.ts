import type { ClientMessage, ServerMessage } from './types.js';
import { sendTo } from './presence.js';
import { saveMessage, getConversationMembers, getMessagesSince, getUserConversations, toggleMessageReaction } from './firestore.js';
import { trackP2PSignal } from './channelFanout.js';
import { sendPushToUser } from './pushNotify.js';
import { isContact, isPushMuted } from './contacts.js';

const MAX_BODY_LENGTH = 10_000;
const MAX_EMOJI_LENGTH = 16;
const MAX_SYNC_MESSAGES = 1000;

export async function routeMessage(fromUserId: string, msg: ClientMessage) {
  switch (msg.type) {
    case 'chat':
      return handleChat(fromUserId, msg);
    case 'chat_group':
      return handleGroupChat(fromUserId, msg);
    case 'chat_reaction':
      return handleChatReaction(fromUserId, msg);
    case 'signal':
      return handleSignal(fromUserId, msg);
    case 'sync':
      return handleSync(fromUserId, msg);
    case 'typing':
      sendTo(msg.to, { type: 'typing', from: fromUserId, convId: msg.convId });
      return;
  }
}

async function handleChat(
  fromUserId: string,
  msg: Extract<ClientMessage, { type: 'chat' }>
) {
  // Validate body size
  if (typeof msg.message.body !== 'string' || msg.message.body.length > MAX_BODY_LENGTH) {
    console.warn(`[chat] rejected: body too large from ${fromUserId}`);
    return;
  }

  // Enforce authorId — prevent impersonation
  msg.message.authorId = fromUserId;

  // Verify sender and recipient are members of the conversation
  const members = await getConversationMembers(msg.convId);
  if (!members.includes(fromUserId) || !members.includes(msg.to)) {
    console.warn(`[chat] rejected: ${fromUserId} or ${msg.to} not member of ${msg.convId}`);
    return;
  }

  console.log(`[chat] ${fromUserId} -> ${msg.to} (${msg.convId}) msgId=${msg.message.id}`);
  await saveMessage(msg.message);

  // Deliver to recipient
  const delivered = sendTo(msg.to, {
    type: 'chat',
    from: fromUserId,
    convId: msg.convId,
    message: msg.message,
  });
  console.log(`[chat] delivered=${delivered} to=${msg.to}`);

  // Push notification if not delivered via WS
  if (!delivered) {
    const muted = await isPushMuted(msg.to, fromUserId);
    if (!muted) {
      const preview = msg.message.body.length > 100 ? msg.message.body.slice(0, 100) + '...' : msg.message.body;
      sendPushToUser(msg.to, 'New message', `${msg.message.authorName}: ${preview}`, {
        url: `/chat/${msg.convId}`,
        tag: `chat-${msg.convId}`,
      }).catch(err => console.error('[push] chat push failed:', err));
    }
  }

  // Ack to sender
  sendTo(fromUserId, { type: 'ack', messageId: msg.message.id });
}

async function handleGroupChat(
  fromUserId: string,
  msg: Extract<ClientMessage, { type: 'chat_group' }>
) {
  // Validate body size
  if (typeof msg.message.body !== 'string' || msg.message.body.length > MAX_BODY_LENGTH) {
    console.warn(`[chat_group] rejected: body too large from ${fromUserId}`);
    return;
  }

  // Enforce authorId
  msg.message.authorId = fromUserId;

  // Verify sender is a member
  const members = await getConversationMembers(msg.convId);
  if (!members.includes(fromUserId)) {
    console.warn(`[chat_group] rejected: ${fromUserId} not member of ${msg.convId}`);
    return;
  }

  await saveMessage(msg.message);

  const preview = msg.message.body.length > 100 ? msg.message.body.slice(0, 100) + '...' : msg.message.body;
  for (const memberId of members) {
    if (memberId !== fromUserId) {
      const delivered = sendTo(memberId, {
        type: 'chat',
        from: fromUserId,
        convId: msg.convId,
        message: msg.message,
      });
      if (!delivered) {
        const muted = await isPushMuted(memberId, fromUserId);
        if (!muted) {
          sendPushToUser(memberId, 'New message', `${msg.message.authorName}: ${preview}`, {
            url: `/chat/${msg.convId}`,
            tag: `chat-${msg.convId}`,
          }).catch(err => console.error('[push] group push failed:', err));
        }
      }
    }
  }

  // Ack to sender
  sendTo(fromUserId, { type: 'ack', messageId: msg.message.id });
}

async function handleSignal(
  fromUserId: string,
  msg: Extract<ClientMessage, { type: 'signal' }>
) {
  // Only allow signaling to contacts
  if (!await isContact(fromUserId, msg.to)) {
    console.warn(`[signal] rejected: ${fromUserId} -> ${msg.to} (not contacts)`);
    return;
  }

  trackP2PSignal(fromUserId, msg.to, msg.payload);

  const delivered = sendTo(msg.to, {
    type: 'signal',
    from: fromUserId,
    payload: msg.payload,
  });
  console.log(`[signal] ${fromUserId} -> ${msg.to} ${(msg.payload as { type: string }).type} delivered=${delivered}`);
}

async function handleChatReaction(
  fromUserId: string,
  msg: Extract<ClientMessage, { type: 'chat_reaction' }>
) {
  if (typeof msg.emoji !== 'string') return;
  const emoji = msg.emoji.trim();
  if (!emoji || emoji.length > MAX_EMOJI_LENGTH) {
    console.warn(`[chat_reaction] rejected: invalid emoji from ${fromUserId}`);
    return;
  }

  const members = await getConversationMembers(msg.convId);
  if (!members.includes(fromUserId)) {
    console.warn(`[chat_reaction] rejected: ${fromUserId} not member of ${msg.convId}`);
    return;
  }

  const reactions = await toggleMessageReaction(msg.convId, msg.messageId, fromUserId, emoji);
  if (!reactions) {
    console.warn(`[chat_reaction] rejected: message ${msg.messageId} not found in ${msg.convId}`);
    return;
  }

  const payload: ServerMessage = {
    type: 'message_reaction',
    convId: msg.convId,
    messageId: msg.messageId,
    reactions,
    updatedBy: fromUserId,
  };
  for (const memberId of members) {
    sendTo(memberId, payload);
  }
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
    if (allMessages.length >= MAX_SYNC_MESSAGES) break;
  }
  allMessages.sort((a, b) => a.createdAt - b.createdAt);
  sendTo(fromUserId, { type: 'sync', messages: allMessages.slice(0, MAX_SYNC_MESSAGES) });
}
