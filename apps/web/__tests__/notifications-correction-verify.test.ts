import { describe, it, expect } from 'vitest';
import { notificationHref } from '../lib/notifications';

// CS-24 (F-e / D-7) — `Notification.refId` is a bare uuid and cannot say which producer wrote it
// (CS-2's page fan-out stores the PROJECT id in the same column). Every project_activity notification
// carrying a refId therefore goes through the resolver route, which fails closed to /projets.
describe('notificationHref — CS-24 correction deep link', () => {
  it('routes a project_activity notification with a refId through the correction resolver', () => {
    expect(notificationHref('project_activity', 'corr-1')).toBe('/revision/c/corr-1');
  });

  it('keeps /projets when a project_activity notification has no refId', () => {
    expect(notificationHref('project_activity', null)).toBe('/projets');
  });

  it('leaves every other type on its existing destination', () => {
    expect(notificationHref('mention', 'p1')).toBe('/projets');
    expect(notificationHref('message', 'm1')).toBe('/contacts');
    expect(notificationHref('invitation', 'i1')).toBe('/invitations');
  });
});
