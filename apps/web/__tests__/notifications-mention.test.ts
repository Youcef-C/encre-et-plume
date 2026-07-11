import { describe, it, expect } from 'vitest';
import type { NotificationItem } from '@encre-et-plume/shared';
import { NOTIF_LABEL, NOTIF_ICON, notificationHref, notificationLabel } from '../lib/notifications';

// CS-2 card-modal extension (B6/F7) — the `mention` type + the per-notification `message` override.
describe('notifications — mention + message override (CS-2)', () => {
  it('has a mention label / icon / href', () => {
    expect(NOTIF_LABEL.mention('Yuki M.')).toBe('Yuki M. vous a mentionné·e dans un commentaire');
    expect(NOTIF_ICON.mention).toBeDefined();
    expect(notificationHref('mention', null)).toBe('/projets');
  });

  it('prefers the server message override over the per-type map', () => {
    const base: NotificationItem = {
      id: 'n1',
      type: 'mention',
      area: 'autres',
      refId: 'p1',
      sourceUser: { displayName: 'Léo', slug: 'leo', avatar: null },
      message: 'Vous avez été mentionné·e sur « Page 7 »',
      createdAt: '2026-07-11T10:00:00.000Z',
      readAt: null,
    };
    expect(notificationLabel(base)).toBe('Vous avez été mentionné·e sur « Page 7 »');
    // Falls back to the type map when message is null.
    expect(notificationLabel({ ...base, message: null })).toBe('Léo vous a mentionné·e dans un commentaire');
  });
});
