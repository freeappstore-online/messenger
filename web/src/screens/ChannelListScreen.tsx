import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Channel } from '../hooks/useChannels';

interface Props {
  channels: Channel[];
  subscriptions: Set<string>;
  currentUserId: string;
  onCreate: (name: string, description: string) => Promise<Channel | undefined>;
  onSubscribe: (channelId: string) => Promise<void>;
  onUnsubscribe: (channelId: string) => Promise<void>;
}

export function ChannelListScreen({ channels, subscriptions, currentUserId, onCreate, onSubscribe, onUnsubscribe }: Props) {
  const navigate = useNavigate();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');

  const handleCreate = async () => {
    if (!name.trim()) return;
    const ch = await onCreate(name.trim(), desc.trim());
    if (ch) {
      setName('');
      setDesc('');
      setShowCreate(false);
      navigate(`/channel/${ch.id}`);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <h2 className="text-lg font-bold text-gray-100">Channels</h2>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full text-xs font-medium transition-colors"
        >
          {showCreate ? 'Cancel' : '+ New'}
        </button>
      </div>
      {showCreate && (
        <div className="px-4 py-3 border-b border-gray-800 space-y-2">
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Channel name"
            className="block w-full px-3 py-2 border border-gray-700 rounded-lg bg-gray-800 text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <input
            value={desc}
            onChange={e => setDesc(e.target.value)}
            placeholder="Description (optional)"
            className="block w-full px-3 py-2 border border-gray-700 rounded-lg bg-gray-800 text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button
            onClick={handleCreate}
            className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Create Channel
          </button>
        </div>
      )}
      {channels.length === 0 && (
        <p className="py-6 text-center text-sm text-gray-500">No channels yet. Create one!</p>
      )}
      {channels.map(ch => {
        const subscribed = subscriptions.has(ch.id);
        const isOwner = ch.ownerId === currentUserId;
        return (
          <div key={ch.id} className="flex items-center px-4 py-3 border-b border-gray-800">
            <div className="flex-1 cursor-pointer min-w-0" onClick={() => navigate(`/channel/${ch.id}`)}>
              <div className="font-semibold text-sm text-gray-100">{ch.name}</div>
              {ch.description && <p className="mt-1 text-xs text-gray-500">{ch.description}</p>}
              {ch.lastPost && <p className="mt-1 text-xs text-gray-600 truncate">{ch.lastPost}</p>}
            </div>
            {!isOwner && (
              <button
                onClick={() => subscribed ? onUnsubscribe(ch.id) : onSubscribe(ch.id)}
                className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${
                  subscribed
                    ? 'border-red-500 text-red-500 hover:bg-red-500/10'
                    : 'border-emerald-500 text-emerald-400 hover:bg-emerald-500/10'
                }`}
              >
                {subscribed ? 'Leave' : 'Join'}
              </button>
            )}
            {isOwner && <span className="text-xs text-emerald-400">Owner</span>}
          </div>
        );
      })}
    </div>
  );
}
