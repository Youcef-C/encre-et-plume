import type { MetadataRoute } from 'next';
import { SITE_URL } from '../lib/site';

/**
 * F-24 FE-2 — Next 15 file convention, served at /robots.txt. No dependency, no `public/`.
 *
 * The disallow list is the private surface (F5): signed-in-only screens, the auth funnel and every
 * owner-only edit route. It mirrors the `robots: { index: false, follow: false }` metadata those
 * routes also export — Disallow stops the crawl, the meta tag stops the indexing of a URL that was
 * discovered some other way (an inbound link). Both are needed; neither replaces the other.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/admin',
        '/appels',
        '/candidatures-recues',
        '/collection/', // only /collection/:id/gerer exists — owner-only
        '/compte-supprime',
        '/connexion',
        '/contacts',
        '/creer',
        '/desabonnement',
        '/espace-editeur',
        '/espace-redaction',
        '/illustration/*/modifier',
        '/inscription',
        '/invitations',
        '/ma-liste',
        '/mes-candidatures',
        '/mot-de-passe-oublie',
        '/notifications',
        '/onboarding',
        '/parametres',
        '/projet/',
        '/projets',
        '/reinitialiser-mot-de-passe',
        '/trouver',
        '/verifier-email',
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
