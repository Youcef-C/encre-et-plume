// F-24 FE-2/F5 — app/robots.ts: the private surface is disallowed, the public one is not.
import { describe, it, expect } from 'vitest';
import robots from '../app/robots';
import { SITE_URL } from '../lib/site';

const PRIVATE = [
  '/parametres',
  '/compte-supprime',
  '/admin',
  '/espace-editeur',
  '/espace-redaction',
  '/projet/',
  '/projets',
  '/notifications',
  '/connexion',
  '/inscription',
  '/mot-de-passe-oublie',
  '/reinitialiser-mot-de-passe',
  '/verifier-email',
  '/onboarding',
  '/desabonnement',
  '/invitations',
  '/contacts',
  '/mes-candidatures',
  '/candidatures-recues',
  '/ma-liste',
  '/creer',
  '/collection/',
  '/illustration/*/modifier',
];

describe('robots.txt (F-24)', () => {
  const rules = robots().rules as { userAgent: string; allow: string; disallow: string[] };

  it('allows the site root for every crawler', () => {
    expect(rules.userAgent).toBe('*');
    expect(rules.allow).toBe('/');
  });

  it.each(PRIVATE)('disallows %s', (path) => {
    expect(rules.disallow).toContain(path);
  });

  it('does not disallow the public catalogue', () => {
    for (const p of ['/', '/decouvrir', '/galerie', '/classement', '/oeuvre', '/lecteur']) {
      expect(rules.disallow).not.toContain(p);
    }
  });

  it('points at an absolute sitemap URL', () => {
    expect(robots().sitemap).toBe(`${SITE_URL}/sitemap.xml`);
    expect(String(robots().sitemap)).toMatch(/^https?:\/\//);
  });
});
