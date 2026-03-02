import { useState } from 'react';
import { updateProfile, type User } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { Save, LogOut, Trash2, Bell } from 'lucide-react';
import { requestNotificationPermission, hasNotificationPermission, canRequestNotificationPermission } from '../utils/pwa';
import { requestFCMToken, saveFCMToken } from '../services/fcm';

interface Props {
  user: User;
  logout: () => void;
  deleteAccount: () => Promise<void>;
}

export function SettingsScreen({ user, logout, deleteAccount }: Props) {
  const [name, setName] = useState(user.displayName || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const [notifGranted, setNotifGranted] = useState(hasNotificationPermission);

  const handleEnableNotifications = async () => {
    const permission = await requestNotificationPermission();
    setNotifGranted(permission === 'granted');
    if (permission === 'granted') {
      const token = await requestFCMToken();
      if (token) await saveFCMToken(user.uid, token);
    }
  };

  const handleSaveName = async () => {
    if (!name.trim() || name.trim() === user.displayName) return;
    setSaving(true);
    setSaved(false);
    try {
      await updateProfile(user, { displayName: name.trim() });
      await updateDoc(doc(db, 'users', user.uid), { displayName: name.trim() });
      setSaved(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setError('');
    try {
      await deleteAccount();
    } catch (e: any) {
      if (e.code === 'auth/requires-recent-login') {
        setError('Please sign out, sign back in, and try again.');
      } else {
        setError(e.message);
      }
      setConfirming(false);
    }
  };

  return (
    <div className="h-full overflow-auto p-6">
      <h2 className="text-lg font-bold text-gray-100 mb-4">Settings</h2>
      <div className="mb-6">
        <p className="text-sm text-gray-300"><strong>Email:</strong> {user.email}</p>
        <p className="text-xs text-gray-500"><strong>UID:</strong> {user.uid}</p>
      </div>
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-400 mb-1.5">Display Name</label>
        <div className="flex gap-2">
          <input
            value={name}
            onChange={e => { setName(e.target.value); setSaved(false); }}
            onKeyDown={e => e.key === 'Enter' && handleSaveName()}
            className="flex-1 px-3 py-2 border border-gray-700 rounded-lg bg-gray-800 text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button
            onClick={handleSaveName}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors disabled:bg-gray-600"
          >
            <Save size={16} />
            {saving ? '...' : 'Save'}
          </button>
        </div>
        {saved && <p className="text-green-400 text-xs mt-1">Saved!</p>}
      </div>
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-400 mb-1.5">Notifications</label>
        {notifGranted ? (
          <p className="text-sm text-green-400">Notifications enabled</p>
        ) : canRequestNotificationPermission() ? (
          <button
            onClick={handleEnableNotifications}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Bell size={16} />
            Enable Notifications
          </button>
        ) : (
          <p className="text-sm text-gray-500">Notifications blocked by browser</p>
        )}
      </div>
      <button onClick={logout} className="flex items-center gap-2 px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors">
        <LogOut size={16} />
        Sign Out
      </button>
      <div className="mt-12">
        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            className="flex items-center gap-2 px-6 py-2.5 border border-red-500 text-red-500 rounded-lg text-sm font-medium hover:bg-red-500/10 transition-colors"
          >
            <Trash2 size={16} />
            Delete Account
          </button>
        ) : (
          <div>
            <p className="text-red-400 text-sm mb-3">This will permanently delete your account and data. Are you sure?</p>
            <div className="flex gap-3">
              <button onClick={handleDelete} className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors">
                Yes, Delete
              </button>
              <button onClick={() => setConfirming(false)} className="px-6 py-2.5 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded-lg text-sm font-medium transition-colors">
                Cancel
              </button>
            </div>
          </div>
        )}
        {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
      </div>
    </div>
  );
}
