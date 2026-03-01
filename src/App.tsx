import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { useWsClient } from './hooks/useWsClient';
import { useConversations } from './hooks/useConversations';
import { usePresence } from './hooks/usePresence';
import { LoginScreen } from './screens/LoginScreen';
import { ConversationList } from './screens/ConversationList';
import { ChatScreen } from './screens/ChatScreen';
import { ContactsScreen } from './screens/ContactsScreen';
import { ChannelListScreen } from './screens/ChannelListScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { AppShell } from './components/AppShell';

export const App = () => {
  const { user, loading, loginEmail, loginGoogle, logout } = useAuth();
  const wsClient = useWsClient(user);
  const conversations = useConversations(user?.uid);
  const onlineUsers = usePresence(wsClient);

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

  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={
            <ConversationList
              conversations={conversations}
              currentUserId={currentUserId}
              onlineUsers={onlineUsers}
            />
          } />
          <Route path="/chat/:convId" element={
            <ChatScreen
              currentUserId={currentUserId}
              currentUserName={currentUserName}
              wsClient={wsClient}
            />
          } />
          <Route path="/contacts" element={<ContactsScreen />} />
          <Route path="/channels" element={<ChannelListScreen />} />
          <Route path="/settings" element={<SettingsScreen user={user} logout={logout} />} />
          <Route path="/login" element={<Navigate to="/" />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
};

export default App;
