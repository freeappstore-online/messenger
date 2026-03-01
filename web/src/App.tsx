import { useEffect, useMemo } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { useWsClient } from './hooks/useWsClient';
import { useConversations } from './hooks/useConversations';
import { usePresence } from './hooks/usePresence';
import { useContacts } from './hooks/useContacts';
import { useUserNames } from './hooks/useUserNames';
import { useCall } from './hooks/useCall';
import { chatDB } from './chat/db';
import { LoginScreen } from './screens/LoginScreen';
import { ConversationList } from './screens/ConversationList';
import { ChatScreen } from './screens/ChatScreen';
import { ContactsScreen } from './screens/ContactsScreen';
import { ChannelListScreen } from './screens/ChannelListScreen';
import { ChannelScreen } from './screens/ChannelScreen';
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
  const { call, startCall, acceptCall, rejectCall, endCall, toggleMute, toggleVideo } = useCall(user?.uid, wsClient);
  const { channels, subscriptions, createChannel, subscribe, unsubscribe } = useChannels(user?.uid);

  // Global WS sink: persist all incoming chat messages to Dexie
  // so messages arriving while viewing a different screen aren't lost
  useEffect(() => {
    return wsClient.onMessage((msg) => {
      if (msg.type === 'chat') {
        chatDB.messages.put(msg.message).catch(() => {});
      }
    });
  }, [wsClient]);

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

  const callPeerName = call.peerId ? (userNames.get(call.peerId) ?? call.peerId) : '';

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
      <AppShell>
        <Routes>
          <Route path="/" element={
            <ConversationList
              conversations={conversations}
              currentUserId={currentUserId}
              onlineUsers={onlineUsers}
              userNames={userNames}
            />
          } />
          <Route path="/chat/:convId" element={
            <ChatScreen
              currentUserId={currentUserId}
              currentUserName={currentUserName}
              wsClient={wsClient}
              onlineUsers={onlineUsers}
              onStartCall={startCall}
            />
          } />
          <Route path="/contacts" element={
            <ContactsScreen
              currentUserId={currentUserId}
              contacts={contacts}
              requests={requests}
              onlineUsers={onlineUsers}
              addContact={addContact}
              acceptRequest={acceptRequest}
              declineRequest={declineRequest}
              removeContact={removeContact}
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
            />
          } />
          <Route path="/channel/:channelId" element={
            <ChannelScreen
              currentUserId={currentUserId}
              currentUserName={currentUserName}
              wsClient={wsClient}
              channels={channels}
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
