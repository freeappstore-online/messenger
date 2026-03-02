import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Contact } from '@famchat/shared';
import type { ContactSettings } from '../hooks/useContactSettings';
import type { Channel } from '../hooks/useChannels';
import { ArrowLeft, LogIn, LogOut, Save } from 'lucide-react';

interface Props {
  currentUserId: string;
  contacts: Contact[];
  channels: Channel[];
  contactsByChannel: Map<string, string[]>;
  subscriptions: Set<string>;
  onSubscribe: (channelId: string) => Promise<void>;
  onUnsubscribe: (channelId: string) => Promise<void>;
  userNames: Map<string, string>;
  settingsByUser: Map<string, ContactSettings>;
  saveContactSettings: (contactUserId: string, patch: ContactSettings) => Promise<void>;
}

export function ContactSettingsScreen({
  currentUserId,
  contacts,
  channels,
  contactsByChannel,
  subscriptions,
  onSubscribe,
  onUnsubscribe,
  userNames,
  settingsByUser,
  saveContactSettings,
}: Props) {
  const { contactId } = useParams<{ contactId: string }>();
  const navigate = useNavigate();
  const [nickname, setNickname] = useState('');
  const [notes, setNotes] = useState('');
  const [mutePush, setMutePush] = useState(false);
  const [muteInApp, setMuteInApp] = useState(false);
  const [saving, setSaving] = useState(false);
  const [channelBusy, setChannelBusy] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const contact = useMemo(() => contacts.find((c) => c.userId === contactId), [contacts, contactId]);
  const baseName = contact ? contact.displayName : (contactId ? (userNames.get(contactId) ?? contactId) : 'Contact');
  const settings = contactId ? settingsByUser.get(contactId) : undefined;
  const ownedChannels = useMemo(() => {
    if (!contactId) return [];
    return channels
      .filter((ch) => ch.ownerId === contactId)
      .sort((a, b) => (b.lastPostAt ?? b.createdAt) - (a.lastPostAt ?? a.createdAt));
  }, [channels, contactId]);
  const subscribedChannels = useMemo(() => {
    if (!contactId) return [];
    return channels
      .filter((ch) => (contactsByChannel.get(ch.id)?.includes(contactId) ?? false))
      .filter((ch) => ch.ownerId !== contactId)
      .sort((a, b) => (b.lastPostAt ?? b.createdAt) - (a.lastPostAt ?? a.createdAt));
  }, [channels, contactId, contactsByChannel]);

  useEffect(() => {
    setNickname(settings?.nickname ?? '');
    setNotes(settings?.notes ?? '');
    setMutePush(!!settings?.mutePush);
    setMuteInApp(!!settings?.muteInApp);
    setSaved(false);
    setError('');
  }, [settings, contactId]);

  if (!contactId) return null;

  const toggleSubscription = async (channelId: string) => {
    setChannelBusy((prev) => new Set(prev).add(channelId));
    try {
      if (subscriptions.has(channelId)) await onUnsubscribe(channelId);
      else await onSubscribe(channelId);
    } finally {
      setChannelBusy((prev) => {
        const next = new Set(prev);
        next.delete(channelId);
        return next;
      });
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      await saveContactSettings(contactId, {
        nickname: nickname.trim(),
        notes: notes.trim(),
        mutePush,
        muteInApp,
      });
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full overflow-auto">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 bg-gray-900">
        <button onClick={() => navigate(-1)} className="p-2 text-emerald-400 transition-colors hover:text-emerald-300">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-gray-100 truncate">{baseName}</div>
          <div className="text-xs text-gray-500">Contact settings</div>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        <label className="block">
          <div className="text-xs uppercase tracking-wide text-gray-500 mb-1.5">Display Name</div>
          <input
            value={nickname}
            onChange={(e) => { setNickname(e.target.value); setSaved(false); }}
            placeholder={baseName}
            className="w-full px-3 py-2.5 border border-gray-700 rounded-lg bg-gray-800 text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </label>

        <label className="block">
          <div className="text-xs uppercase tracking-wide text-gray-500 mb-1.5">Notes</div>
          <textarea
            value={notes}
            onChange={(e) => { setNotes(e.target.value); setSaved(false); }}
            rows={6}
            placeholder="Personal notes about this contact..."
            className="w-full px-3 py-2.5 border border-gray-700 rounded-lg bg-gray-800 text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </label>

        <label className="flex items-center justify-between rounded-lg border border-gray-700 bg-gray-800 px-3 py-3">
          <div>
            <div className="text-sm text-gray-100">Mute Push Notifications</div>
            <div className="text-xs text-gray-500">No offline push alerts from this person</div>
          </div>
          <input
            type="checkbox"
            checked={mutePush}
            onChange={(e) => { setMutePush(e.target.checked); setSaved(false); }}
            className="h-4 w-4 accent-emerald-500"
          />
        </label>
        <label className="flex items-center justify-between rounded-lg border border-gray-700 bg-gray-800 px-3 py-3">
          <div>
            <div className="text-sm text-gray-100">Mute In-App Message Alerts</div>
            <div className="text-xs text-gray-500">Suppress browser notifications while app is open</div>
          </div>
          <input
            type="checkbox"
            checked={muteInApp}
            onChange={(e) => { setMuteInApp(e.target.checked); setSaved(false); }}
            className="h-4 w-4 accent-emerald-500"
          />
        </label>

        <section className="rounded-lg border border-gray-700 bg-gray-900/40">
          <div className="px-3 py-2 border-b border-gray-700 text-xs uppercase tracking-wide text-gray-500">
            Their Channels ({ownedChannels.length})
          </div>
          {ownedChannels.length === 0 && (
            <div className="px-3 py-3 text-sm text-gray-500">No owned channels.</div>
          )}
          {ownedChannels.map((ch) => {
            const subscribed = subscriptions.has(ch.id);
            const isBusy = channelBusy.has(ch.id);
            const canToggle = ch.ownerId !== currentUserId;
            return (
              <div key={ch.id} className="flex items-center gap-2 px-3 py-2 border-b border-gray-800 last:border-b-0">
                <button
                  type="button"
                  onClick={() => navigate(`/channel/${ch.id}`)}
                  className="flex-1 min-w-0 text-left"
                >
                  <div className="text-sm font-medium text-gray-100 truncate">{ch.name}</div>
                  {ch.description && <div className="text-xs text-gray-500 truncate">{ch.description}</div>}
                </button>
                {canToggle ? (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => toggleSubscription(ch.id)}
                    className={`p-2 rounded-lg transition-colors disabled:opacity-50 ${
                      subscribed
                        ? 'text-red-500 hover:bg-red-500/10'
                        : 'text-emerald-400 hover:bg-emerald-500/10'
                    }`}
                    title={subscribed ? 'Unsubscribe' : 'Subscribe'}
                  >
                    {subscribed ? <LogOut size={16} /> : <LogIn size={16} />}
                  </button>
                ) : (
                  <span className="text-xs text-emerald-400">Owner</span>
                )}
              </div>
            );
          })}
        </section>

        <section className="rounded-lg border border-gray-700 bg-gray-900/40">
          <div className="px-3 py-2 border-b border-gray-700 text-xs uppercase tracking-wide text-gray-500">
            They Follow ({subscribedChannels.length})
          </div>
          {subscribedChannels.length === 0 && (
            <div className="px-3 py-3 text-sm text-gray-500">No channel subscriptions found.</div>
          )}
          {subscribedChannels.map((ch) => {
            const subscribed = subscriptions.has(ch.id);
            const isBusy = channelBusy.has(ch.id);
            const canToggle = ch.ownerId !== currentUserId;
            const ownerLabel = userNames.get(ch.ownerId) ?? ch.ownerId;
            return (
              <div key={ch.id} className="flex items-center gap-2 px-3 py-2 border-b border-gray-800 last:border-b-0">
                <button
                  type="button"
                  onClick={() => navigate(`/channel/${ch.id}`)}
                  className="flex-1 min-w-0 text-left"
                >
                  <div className="text-sm font-medium text-gray-100 truncate">{ch.name}</div>
                  <div className="text-xs text-gray-500 truncate">Owner: {ownerLabel}</div>
                </button>
                {canToggle ? (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => toggleSubscription(ch.id)}
                    className={`p-2 rounded-lg transition-colors disabled:opacity-50 ${
                      subscribed
                        ? 'text-red-500 hover:bg-red-500/10'
                        : 'text-emerald-400 hover:bg-emerald-500/10'
                    }`}
                    title={subscribed ? 'Unsubscribe' : 'Subscribe'}
                  >
                    {subscribed ? <LogOut size={16} /> : <LogIn size={16} />}
                  </button>
                ) : (
                  <span className="text-xs text-emerald-400">Owner</span>
                )}
              </div>
            );
          })}
        </section>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-600 text-white rounded-lg transition-colors"
        >
          <Save size={16} />
          {saving ? 'Saving...' : 'Save'}
        </button>
        {saved && <p className="text-xs text-emerald-400">Saved.</p>}
        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    </div>
  );
}
