import { describe, it, expect } from 'vitest';
import { NOTIF_LABEL, notificationHref } from '../lib/notifications';

// MC-8 — lock the French copy + route for the two connection notification types (F1).
describe('notifications — connection types (MC-8)', () => {
  it('connection_request label names the requester and its intent', () => {
    expect(NOTIF_LABEL.connection_request('Noé P.')).toBe('Noé P. souhaite se connecter avec vous');
  });

  it('connection_accepted label names the accepter', () => {
    expect(NOTIF_LABEL.connection_accepted('Léa B.')).toBe('Léa B. a accepté votre demande de connexion');
  });

  it('both connection notifications route to /contacts', () => {
    expect(notificationHref('connection_request', null)).toBe('/contacts');
    expect(notificationHref('connection_accepted', null)).toBe('/contacts');
  });
});
