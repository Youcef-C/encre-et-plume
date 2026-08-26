// F-24 — the server-side SEO surface: one anonymous public fetch per content route, reused by both
// `generateMetadata` and the page itself, plus the metadata/JSON-LD builders.
//
// TWO TRAPS live here, both load-bearing:
//
// 1. `generateMetadata` and the page MUST call the same loader with IDENTICAL arguments. Next
//    memoizes `fetch` within one render pass only when the URL, method and options match exactly —
//    a single differing option doubles every work page's API load.
// 2. The fetch is ANONYMOUS on purpose: no `credentials`, no cookie forwarding. The response is
//    cached by `revalidate` and shared across viewers, so a personalised payload would leak between
//    users. The client component still refetches for the signed-in view — that is exactly why the
//    server result is passed down as an `initialData` prop instead of replacing the component.

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import type { IllustrationDetail, ProfileResponse, WorkDetail } from '@encre-et-plume/shared';
import { isWork18Plus } from '@encre-et-plume/shared';
import { siteUrl } from './site';

const API = (process.env.NEXT_PUBLIC_API_URL as string | undefined) ?? 'http://localhost:3001';

/** Shared revalidate window. Part of the dedupe key — never vary it per call site (trap 1). */
export const SEO_REVALIDATE = 60;

export const SITE_NAME = 'Encre & Plume';

/** `robots` value for the private surface (F5) and for age-gated content (D-2). */
export const NOINDEX = { index: false, follow: false } as const;

export interface PublicResource<T> {
  data: T | null;
  /** 200 · 403 (age/private gate — pass through) · 404 (real 404) · 0 (API unreachable). */
  status: number;
}

async function load<T>(path: string): Promise<PublicResource<T>> {
  try {
    const res = await fetch(`${API}${path}`, { next: { revalidate: SEO_REVALIDATE } });
    if (!res.ok) return { data: null, status: res.status };
    return { data: (await res.json()) as T, status: 200 };
  } catch {
    // The API being unreachable is not a 404. Render the shell and let the client fetch.
    return { data: null, status: 0 };
  }
}

export const getWorkSeo = (slug: string): Promise<PublicResource<WorkDetail>> =>
  load<WorkDetail>(`/works/${encodeURIComponent(slug)}`);

export const getProfileSeo = (slug: string): Promise<PublicResource<ProfileResponse>> =>
  load<ProfileResponse>(`/profiles/${encodeURIComponent(slug)}`);

export const getIllustrationSeo = (id: string): Promise<PublicResource<IllustrationDetail>> =>
  load<IllustrationDetail>(`/illustrations/${encodeURIComponent(id)}`);

/**
 * The live bug this story fixes: `app/[slug]` is a ROOT catch-all, so every unknown top-level URL
 * used to answer HTTP 200 with a client-rendered "Profil introuvable" — an unbounded set of
 * indexable garbage URLs.
 *
 * ONLY a 404 becomes a 404. A 403 must pass through so DR-10's age/private gate still renders, and
 * a 5xx/offline must pass through so a momentary API blip doesn't tell Google the page is gone.
 */
export function notFoundOn404(status: number): void {
  if (status === 404) notFound();
}

const MAX_DESCRIPTION = 160;

/** Plain-text, whitespace-collapsed, word-boundary-truncated meta description. */
export function seoDescription(text: string | null | undefined, fallback: string): string {
  const plain = (text ?? '').replace(/\s+/g, ' ').trim();
  const source = plain.length > 0 ? plain : fallback;
  if (source.length <= MAX_DESCRIPTION) return source;
  const cut = source.slice(0, MAX_DESCRIPTION - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).replace(/[ ,;:.…]+$/, '')}…`;
}

export interface PageSeo {
  title: string;
  description: string;
  /** Site-relative path, e.g. `/oeuvre/neon-sutra`. */
  path: string;
  image?: string | null;
  /** Open Graph type — 'website' by default, 'article' / 'profile' where it applies. */
  type?: 'website' | 'article' | 'profile';
  noindex?: boolean;
}

/**
 * D-11: the suffix is appended here rather than through a root `title.template`. The 23 pages that
 * already ship a static title spell " — Encre & Plume" out in full; adding a template would render
 * every one of them as "Découvrir — Encre & Plume — Encre & Plume".
 */
export function buildMetadata({ title, description, path, image, type = 'website', noindex }: PageSeo): Metadata {
  const url = siteUrl(path);
  const images = image ? [image] : undefined;
  return {
    title: `${title} — ${SITE_NAME}`,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: SITE_NAME, locale: 'fr_FR', type, images },
    twitter: { card: images ? 'summary_large_image' : 'summary', title, description, images },
    ...(noindex ? { robots: NOINDEX } : {}),
  };
}

// ── JSON-LD builders (F7) — plain objects; `components/JsonLd.tsx` serialises them. ──────────────

export function workJsonLd(work: WorkDetail): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': work.format === 'Roman' ? 'Book' : 'CreativeWork',
    name: work.title,
    url: siteUrl(`/oeuvre/${work.slug}`),
    inLanguage: 'fr',
    genre: [work.genre, ...work.themes].filter(Boolean),
    ...(work.synopsis ? { description: seoDescription(work.synopsis, work.title) } : {}),
    ...(work.cover ? { image: work.cover } : {}),
    ...(work.publishedAt ? { datePublished: work.publishedAt } : {}),
    ...(work.team.length ? { author: work.team.map((c) => ({ '@type': 'Person', name: c.name })) } : {}),
    ...(work.reviewCount > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: work.ratingAvg,
            reviewCount: work.reviewCount,
            bestRating: 5,
          },
        }
      : {}),
  };
}

export function profileJsonLd(profile: ProfileResponse): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: profile.displayName,
    url: siteUrl(`/${profile.slug}`),
    ...(profile.bio ? { description: seoDescription(profile.bio, profile.displayName) } : {}),
    ...(profile.avatar ? { image: profile.avatar } : {}),
    ...(profile.roleLine ? { jobTitle: profile.roleLine } : {}),
  };
}

export function illustrationJsonLd(illustration: IllustrationDetail): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'VisualArtwork',
    name: illustration.title,
    url: siteUrl(`/illustration/${illustration.id}`),
    ...(illustration.description ? { description: seoDescription(illustration.description, illustration.title) } : {}),
    ...(illustration.image ? { image: illustration.image } : {}),
    ...(illustration.publishedAt ? { datePublished: illustration.publishedAt } : {}),
    creator: { '@type': 'Person', name: illustration.artist.name },
  };
}

export function breadcrumbJsonLd(trail: { name: string; path: string }[]): Record<string, unknown> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((step, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: step.name,
      item: siteUrl(step.path),
    })),
  };
}
