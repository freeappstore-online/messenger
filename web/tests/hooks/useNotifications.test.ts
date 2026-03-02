import { describe, expect, it } from 'vitest';
import {
  getPeerIdFromChatUrl,
  resolveNotificationSenderId,
  shouldMuteInAppNotification,
} from '../../src/hooks/useNotifications';

describe('useNotifications helpers', () => {
  it('extracts peer id from direct chat URL', () => {
    expect(getPeerIdFromChatUrl('/chat/alice:bob', 'alice')).toBe('bob');
    expect(getPeerIdFromChatUrl('/chat/alice:bob?x=1', 'alice')).toBe('bob');
  });

  it('returns undefined for non-direct conversation URLs', () => {
    expect(getPeerIdFromChatUrl('/chat/group-123', 'alice')).toBeUndefined();
    expect(getPeerIdFromChatUrl('/channels', 'alice')).toBeUndefined();
    expect(getPeerIdFromChatUrl(undefined, 'alice')).toBeUndefined();
  });

  it('prefers explicit senderId over URL parsing', () => {
    const sender = resolveNotificationSenderId(
      { senderId: 'from-payload', url: '/chat/alice:bob' },
      'alice',
    );
    expect(sender).toBe('from-payload');
  });

  it('mutes notifications only when sender is muted', () => {
    const settings = new Map<string, { muteInApp?: boolean }>();
    settings.set('u1', { muteInApp: true });
    settings.set('u2', { muteInApp: false });

    expect(shouldMuteInAppNotification('u1', settings)).toBe(true);
    expect(shouldMuteInAppNotification('u2', settings)).toBe(false);
    expect(shouldMuteInAppNotification(undefined, settings)).toBe(false);
  });
});
