// F-24 FE-7/F5 — every private route tells crawlers not to index it.
//
// The metadata owner is the route's own `page.tsx` when it is a server component, and the nearest
// `layout.tsx` when the page is `'use client'` (a client component cannot export `metadata`).
import { describe, it, expect, vi } from 'vitest';
import type { Metadata } from 'next';

vi.mock('next/navigation', () => ({
  notFound: vi.fn(),
  redirect: vi.fn(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
  useParams: () => ({}),
}));

const OWNERS: [string, () => Promise<{ metadata?: Metadata }>][] = [
  ['/admin', () => import('../app/admin/layout')],
  ['/parametres', () => import('../app/parametres/layout')],
  ['/creer', () => import('../app/creer/layout')],
  ['/invitations', () => import('../app/invitations/layout')],
  ['/notifications', () => import('../app/notifications/layout')],
  ['/projet/[slug]', () => import('../app/projet/layout')],
  ['/espace-editeur', () => import('../app/espace-editeur/page')],
  ['/espace-redaction', () => import('../app/espace-redaction/page')],
  ['/compte-supprime', () => import('../app/compte-supprime/page')],
  ['/desabonnement', () => import('../app/desabonnement/page')],
  ['/onboarding', () => import('../app/onboarding/page')],
  ['/projets', () => import('../app/projets/page')],
  ['/connexion', () => import('../app/connexion/page')],
  ['/inscription', () => import('../app/inscription/page')],
  ['/mot-de-passe-oublie', () => import('../app/mot-de-passe-oublie/page')],
  ['/reinitialiser-mot-de-passe', () => import('../app/reinitialiser-mot-de-passe/page')],
  ['/verifier-email', () => import('../app/verifier-email/page')],
  ['/verifier-email/envoye', () => import('../app/verifier-email/envoye/page')],
  ['/contacts', () => import('../app/contacts/page')],
  ['/mes-candidatures', () => import('../app/mes-candidatures/page')],
  ['/candidatures-recues', () => import('../app/candidatures-recues/page')],
  ['/ma-liste', () => import('../app/ma-liste/page')],
  ['/appels', () => import('../app/appels/page')],
  ['/trouver', () => import('../app/trouver/page')],
  ['/collection/[id]/gerer', () => import('../app/collection/[id]/gerer/page')],
  ['/illustration/[id]/modifier', () => import('../app/illustration/[id]/modifier/page')],
];

describe('noindex on the private surface (F-24 F5)', () => {
  it.each(OWNERS)('%s exports robots noindex, nofollow', async (_route, load) => {
    const mod = await load();

    expect(mod.metadata?.robots).toEqual({ index: false, follow: false });
  });

  it('leaves the public catalogue indexable', async () => {
    const publicPages: (() => Promise<{ metadata?: unknown }>)[] = [
      () => import('../app/decouvrir/page'),
      () => import('../app/galerie/page'),
      () => import('../app/classement/page'),
      () => import('../app/cgu/page'),
    ];
    for (const load of publicPages) {
      expect(((await load()).metadata as Metadata | undefined)?.robots).toBeUndefined();
    }
  });
});
