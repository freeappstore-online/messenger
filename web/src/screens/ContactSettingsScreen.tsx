import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Contact } from '@famchat/shared';
import type { ContactSettings } from '../hooks/useContactSettings';
import { ArrowLeft, Save } from 'lucide-react';

interface Props {
  contacts: Contact[];
  userNames: Map<string, string>;
  settingsByUser: Map<string, ContactSettings>;
  saveContactSettings: (contactUserId: string, patch: ContactSettings) => Promise<void>;
}

export function ContactSettingsScreen({ contacts, userNames, settingsByUser, saveContactSettings }: Props) {
  const { contactId } = useParams<{ contactId: string }>();
  const navigate = useNavigate();
  const [nickname, setNickname] = useState('');
  const [notes, setNotes] = useState('');
  const [mutePush, setMutePush] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const contact = useMemo(() => contacts.find((c) => c.userId === contactId), [contacts, contactId]);
  const baseName = contact ? contact.displayName : (contactId ? (userNames.get(contactId) ?? contactId) : 'Contact');
  const settings = contactId ? settingsByUser.get(contactId) : undefined;

  useEffect(() => {
    setNickname(settings?.nickname ?? '');
    setNotes(settings?.notes ?? '');
    setMutePush(!!settings?.mutePush);
    setSaved(false);
    setError('');
  }, [settings, contactId]);

  if (!contactId) return null;

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      await saveContactSettings(contactId, {
        nickname: nickname.trim(),
        notes: notes.trim(),
        mutePush,
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
