import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import type { Contact, ContactRequest } from '@famchat/shared';
import { ContactItem } from '../components/ContactItem';

interface Props {
  currentUserId: string;
  contacts: Contact[];
  requests: ContactRequest[];
  onlineUsers: Set<string>;
  addContact: (email: string) => Promise<void>;
  acceptRequest: (req: ContactRequest) => Promise<void>;
  declineRequest: (senderId: string) => Promise<void>;
  removeContact: (userId: string) => Promise<void>;
}

export function ContactsScreen({ currentUserId, contacts, requests, onlineUsers, addContact, acceptRequest, declineRequest, removeContact }: Props) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [adding, setAdding] = useState(false);

  const handleAdd = async () => {
    if (!email.trim()) return;
    setError('');
    setSuccess('');
    setAdding(true);
    try {
      await addContact(email.trim());
      setEmail('');
      setSuccess('Request sent!');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAdding(false);
    }
  };

  const openChat = async (contact: Contact) => {
    const sorted = [currentUserId, contact.userId].sort();
    const convId = sorted.join(':');
    await setDoc(doc(db, 'conversations', convId), {
      type: '1:1',
      members: sorted,
      name: null,
      lastMessage: null,
      lastMessageAt: null,
      updatedAt: Date.now(),
    }, { merge: true });
    navigate(`/chat/${convId}`);
  };

  return (
    <div>
      <div className="px-4 py-3 border-b border-gray-800">
        <h2 className="text-lg font-bold text-gray-100 mb-3">Contacts</h2>
        <div className="flex gap-2">
          <input
            value={email}
            onChange={e => { setEmail(e.target.value); setSuccess(''); }}
            onKeyDown={e => e.key === 'Enter' && handleAdd()}
            placeholder="Add by email..."
            className="flex-1 px-3 py-2 border border-gray-700 rounded-lg bg-gray-800 text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button
            onClick={handleAdd}
            disabled={adding}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed"
          >
            {adding ? '...' : 'Add'}
          </button>
        </div>
        {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
        {success && <p className="text-green-400 text-xs mt-2">{success}</p>}
      </div>

      {requests.length > 0 && (
        <div className="border-b border-gray-800">
          <h3 className="px-4 pt-3 pb-1 text-xs font-medium text-gray-500 uppercase tracking-wide">Requests</h3>
          {requests.map(r => (
            <div key={r.fromUserId} className="flex items-center px-4 py-3 gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm text-gray-100">{r.fromDisplayName}</div>
                <div className="text-xs text-gray-500">{r.fromEmail}</div>
              </div>
              <button
                onClick={() => acceptRequest(r)}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium transition-colors"
              >
                Accept
              </button>
              <button
                onClick={() => declineRequest(r.fromUserId)}
                className="px-3.5 py-1.5 border border-red-500 text-red-500 rounded-lg text-xs font-medium hover:bg-red-500/10 transition-colors"
              >
                Decline
              </button>
            </div>
          ))}
        </div>
      )}

      {contacts.length === 0 && requests.length === 0 && (
        <p className="py-6 text-center text-sm text-gray-500">No contacts yet. Add one by email!</p>
      )}
      {contacts.map(c => (
        <ContactItem
          key={c.userId}
          contact={c}
          online={onlineUsers.has(c.userId)}
          onClick={() => openChat(c)}
          onDelete={() => removeContact(c.userId)}
        />
      ))}
    </div>
  );
}
