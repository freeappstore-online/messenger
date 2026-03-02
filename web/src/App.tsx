import { useEffect, useMemo, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { useWsClient } from './hooks/useWsClient';
import { useConversations } from './hooks/useConversations';
import { usePresence } from './hooks/usePresence';
import { useContacts } from './hooks/useContacts';
import { useContactSettings } from './hooks/useContactSettings';
import { useUserNames } from './hooks/useUserNames';
import { useCall } from './hooks/useCall';
import { useChannelPeers } from './hooks/useChannelPeers';
import { useContactChannels } from './hooks/useContactChannels';
import { useNotifications } from './hooks/useNotifications';
import {
  chatDB,
  getChannelPosts as getCachedChannelPosts,
  getPendingChannelPosts,
  markPendingChannelPostSentTo,
  putChannelPost,
} from './chat/db';
import { registerServiceWorker } from './utils/pwa';
import { LoginScreen } from './screens/LoginScreen';
import { ConversationList } from './screens/ConversationList';
import { ChatScreen } from './screens/ChatScreen';
import { ContactsScreen } from './screens/ContactsScreen';
import { ChannelListScreen } from './screens/ChannelListScreen';
import { ChannelScreen } from './screens/ChannelScreen';
import { ContactSettingsScreen } from './screens/ContactSettingsScreen';
import { useChannels } from './hooks/useChannels';
import { SettingsScreen } from './screens/SettingsScreen';
import { AppShell } from './components/AppShell';
import { CallOverlay } from './components/CallOverlay';

export const App = () => {
  const { user, loading, loginEmail, loginGoogle, logout, deleteAccount } = useAuth();
  const wsClient = useWsClient(user);
  const conversations = useConversations(user?.uid, wsClient);
  const onlineUsers = usePresence(wsClient);
  const { contacts, requests, addContact, acceptRequest, declineRequest, removeContact } = useContacts(user?.uid);
  const { settingsByUser, saveContactSettings } = useContactSettings(user?.uid);
  const { call, startCall, acceptCall, rejectCall, endCall, toggleMute, toggleVideo } = useCall(user?.uid, wsClient);
  const { channels, subscriptions, createChannel, subscribe, unsubscribe } = useChannels(user?.uid);
  const { contactsByChannel } = useContactChannels(user?.uid, contacts, subscriptions);
  useNotifications(user?.uid);

  // Register service worker once
  useEffect(() => { registerServiceWorker(); }, []);

  // Compute P2P peer IDs: online contacts with shared channel subscriptions
  const channelPeerIds = useMemo(() => {
    const peerSet = new Set<string>();
    for (const [channelId, contactIds] of contactsByChannel) {
      if (subscriptions.has(channelId)) {
        for (const cid of contactIds) {
          if (onlineUsers.has(cid)) peerSet.add(cid);
        }
      }
    }
    return [...peerSet];
  }, [contactsByChannel, subscriptions, onlineUsers]);

  const p2p = useChannelPeers(user?.uid, wsClient, channelPeerIds);
  const lastSyncRequestRef = useRef<Map<string, number>>(new Map());

  // Global WS sink: persist all incoming chat messages to Dexie
  // so messages arriving while viewing a different screen aren't lost
  useEffect(() => {
    return wsClient.onMessage((msg) => {
      if (msg.type === 'chat') {
        chatDB.messages.put(msg.message).catch(() => {});
      }
    });
  }, [wsClient]);

  // Global P2P sink for channel data so sync works outside Channel screen.
  useEffect(() => {
    return p2p.onP2PMessage(async (peerId, msg) => {
      if (msg.type === 'p2p-channel-post') {
        if (!subscriptions.has(msg.channelId)) return;
        await putChannelPost(msg.channelId, msg.post);
        return;
      }

      if (msg.type === 'p2p-channel-sync-request') {
        if (!subscriptions.has(msg.channelId)) return;
        const cached = await getCachedChannelPosts(msg.channelId, msg.sinceTimestamp);
        p2p.sendToPeer(peerId, {
          type: 'p2p-channel-sync-response',
          channelId: msg.channelId,
          posts: cached,
        });
      }
    });
  }, [p2p, subscriptions]);

  // Replay pending local channel posts to newly connected peers.
  useEffect(() => {
    const connectedPeers = p2p.connectedPeerIds;
    if (connectedPeers.length === 0 || subscriptions.size === 0) return;

    (async () => {
      for (const channelId of subscriptions) {
        const pending = await getPendingChannelPosts(channelId);
        for (const item of pending) {
          for (const peerId of connectedPeers) {
            if (item.sentTo.includes(peerId)) continue;
            p2p.sendToPeer(peerId, { type: 'p2p-channel-post', channelId, post: item.post });
            await markPendingChannelPostSentTo(item.id, peerId);
          }
        }
      }
    })().catch((err) => {
      console.error('[P2P] global pending replay failed', err);
    });
  }, [p2p, p2p.connectedPeerIds, subscriptions]);

  // When peers connect, request channel sync from cache timestamp.
  useEffect(() => {
    const connectedPeers = p2p.connectedPeerIds;
    if (connectedPeers.length === 0 || subscriptions.size === 0) return;

    (async () => {
      const targetPeer = connectedPeers[0];
      for (const channelId of subscriptions) {
        const latest = await getCachedChannelPosts(channelId, undefined, 1);
        const sinceTimestamp = latest.length > 0 ? latest[latest.length - 1].createdAt : undefined;
        const requestKey = `${targetPeer}:${channelId}`;
        const prevTs = lastSyncRequestRef.current.get(requestKey);
        if (prevTs === sinceTimestamp) continue;

        p2p.sendToPeer(targetPeer, {
          type: 'p2p-channel-sync-request',
          channelId,
          sinceTimestamp,
        });
        lastSyncRequestRef.current.set(requestKey, sinceTimestamp ?? -1);
      }
    })().catch((err) => {
      console.error('[P2P] global sync request failed', err);
    });
  }, [p2p, p2p.connectedPeerIds, subscriptions]);

  // Collect all user IDs we need names for: conversation members + contacts
  const allUserIds = useMemo(() => {
    const ids = new Set<string>();
    for (const c of conversations) {
      for (const m of c.members) ids.add(m);
    }
    for (const c of contacts) ids.add(c.userId);
    if (user?.uid) ids.delete(user.uid);
    return [...ids];
  }, [conversations, contacts, user?.uid]);

  const userNames = useUserNames(allUserIds);
  const preferredUserNames = useMemo(() => {
    const next = new Map(userNames);
    for (const [userId, settings] of settingsByUser) {
      const nickname = settings.nickname?.trim();
      if (nickname) next.set(userId, nickname);
    }
    return next;
  }, [settingsByUser, userNames]);

  if (loading) return <div style={{ padding: 24 }}>Loading...</div>;

  if (!user) {
    return (
      <BrowserRouter>
        <LoginScreen loginEmail={loginEmail} loginGoogle={loginGoogle} />
      </BrowserRouter>
    );
  }

  const currentUserId = user.uid;
  const currentUserName = user.displayName || user.email || currentUserId;

  const callPeerName = call.peerId ? (preferredUserNames.get(call.peerId) ?? call.peerId) : '';

  return (
    <BrowserRouter>
      {call.state !== 'idle' && (
        <CallOverlay
          call={call}
          peerName={callPeerName}
          onAccept={acceptCall}
          onReject={rejectCall}
          onEnd={endCall}
          onToggleMute={toggleMute}
          onToggleVideo={toggleVideo}
        />
      )}
      <AppShell wsClient={wsClient}>
        <Routes>
          <Route path="/" element={
            <ConversationList
              conversations={conversations}
              currentUserId={currentUserId}
              onlineUsers={onlineUsers}
              userNames={preferredUserNames}
            />
          } />
          <Route path="/chat/:convId" element={
            <ChatScreen
              currentUserId={currentUserId}
              currentUserName={currentUserName}
              wsClient={wsClient}
              onlineUsers={onlineUsers}
              contactSettings={settingsByUser}
              onStartCall={startCall}
            />
          } />
          <Route path="/contacts" element={
            <ContactsScreen
              currentUserId={currentUserId}
              contacts={contacts}
              contactSettings={settingsByUser}
              requests={requests}
              onlineUsers={onlineUsers}
              addContact={addContact}
              acceptRequest={acceptRequest}
              declineRequest={declineRequest}
              removeContact={removeContact}
            />
          } />
          <Route path="/contact/:contactId/settings" element={
            <ContactSettingsScreen
              contacts={contacts}
              userNames={preferredUserNames}
              settingsByUser={settingsByUser}
              saveContactSettings={saveContactSettings}
            />
          } />
          <Route path="/channels" element={
            <ChannelListScreen
              channels={channels}
              subscriptions={subscriptions}
              currentUserId={currentUserId}
              onCreate={createChannel}
              onSubscribe={subscribe}
              onUnsubscribe={unsubscribe}
              contactsByChannel={contactsByChannel}
            />
          } />
          <Route path="/channel/:channelId" element={
            <ChannelScreen
              currentUserId={currentUserId}
              currentUserName={currentUserName}
              wsClient={wsClient}
              channels={channels}
              p2p={p2p}
            />
          } />
          <Route path="/settings" element={<SettingsScreen user={user} logout={logout} deleteAccount={deleteAccount} />} />
          <Route path="/login" element={<Navigate to="/" />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
};

export default App;
