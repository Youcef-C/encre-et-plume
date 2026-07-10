import { describe, it, expect } from 'vitest';
import { NOTIF_LABEL, NOTIF_ICON, notificationHref } from '../lib/notifications';

// MC-12 — a kicked user gets a `group_removed` notification.
describe('notifications — group_removed (MC-12)', () => {
  it('labels the actor who removed you', () => {
    expect(NOTIF_LABEL.group_removed('Yuki M.')).toBe("Yuki M. vous a retiré·e d'un groupe");
  });

  it('has an icon and routes home (the group no longer exists for the recipient)', () => {
    expect(NOTIF_ICON.group_removed).toBeDefined();
    expect(notificationHref('group_removed', null)).toBe('/');
  });
});
