// F-22 — freetext hashtag normalizer. Single source of truth for the seed, the gallery `tag`
// filter (BE), and the FE chip hrefs / tag input, so a chip's label and the query param always
// agree. Hashtags are freetext (fan-art of existing licenses, techniques) — NOT the controlled
// F-20 genre vocabulary; diacritics are preserved (stored tags like 'néon' keep their accents).

export const HASHTAG_MAX_LENGTH = 30;
export const HASHTAGS_MAX_COUNT = 15;

/**
 * Canonical hashtag token: lowercase, strip leading '#', trim, collapse inner whitespace to a
 * single space, cap at HASHTAG_MAX_LENGTH chars. Returns '' when nothing survives (callers treat
 * '' as "no tag"). Diacritics are intentionally kept.
 */
export function normalizeHashtag(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/^#+/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, HASHTAG_MAX_LENGTH)
    .trim();
}

/**
 * normalizeHashtag over a list: drop empties, dedupe (order preserved), cap at HASHTAGS_MAX_COUNT.
 */
export function normalizeHashtags(list: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of list) {
    const tag = normalizeHashtag(raw);
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
    if (out.length >= HASHTAGS_MAX_COUNT) break;
  }
  return out;
}
