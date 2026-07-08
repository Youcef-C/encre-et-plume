// MC-1 (owner addendum §5) — hierarchical location vocabulary for the partner directory.
// Location unit = country (ISO 3166-1 alpha-2); the 18 French régions are the FR-only sub-level.
// French display names come from `Intl.DisplayNames` (stdlib — Node 24 + browsers), no i18n dependency.
import countryContinents from './country-continents.json';
import { PARTNER_REGIONS } from './partners.js';

/** ISO alpha-2 code → continent code (AF/AN/AS/EU/NA/OC/SA). Static, generated once. */
export const COUNTRY_CONTINENTS = countryContinents as Record<string, string>;
export const COUNTRY_CODES = Object.keys(COUNTRY_CONTINENTS);

/** The 7 continents, keyed by their (uppercase) code, labelled with their French name. */
export const CONTINENTS = [
  { code: 'AF', fr: 'Afrique' },
  { code: 'AN', fr: 'Antarctique' },
  { code: 'AS', fr: 'Asie' },
  { code: 'EU', fr: 'Europe' },
  { code: 'NA', fr: 'Amérique du Nord' },
  { code: 'OC', fr: 'Océanie' },
  { code: 'SA', fr: 'Amérique du Sud' },
] as const;
export const CONTINENT_NAMES_FR = CONTINENTS.map((c) => c.fr);
const CONTINENT_CODE_BY_FR = new Map<string, string>(CONTINENTS.map((c) => [c.fr, c.code]));

/**
 * Every accepted `GET /partners` `locations[]` token: a continent French name, an ISO alpha-2 country
 * code, or a French région. The DTO validates each element against this flat set (per-element 400).
 */
export const PARTNER_LOCATION_TOKENS: string[] = [...CONTINENT_NAMES_FR, ...COUNTRY_CODES, ...PARTNER_REGIONS];

const REGION_SET = new Set<string>(PARTNER_REGIONS);

/**
 * Expand one location token into a Prisma predicate fragment (OR-combined by the caller):
 * - continent name → every country code on that continent (`{ countries }`)
 * - ISO country code → itself (`{ countries: [code] }`) — 'FR' matches any French profile
 * - French région → an exact region match (`{ region }`)
 * Unknown token → null (the DTO rejects these before the service; defensive here).
 */
export function expandLocationToken(token: string): { countries?: string[]; region?: string } | null {
  const continent = CONTINENT_CODE_BY_FR.get(token);
  if (continent) return { countries: COUNTRY_CODES.filter((c) => COUNTRY_CONTINENTS[c] === continent) };
  if (REGION_SET.has(token)) return { region: token };
  if (COUNTRY_CONTINENTS[token]) return { countries: [token] };
  return null;
}

const FR_REGION_NAMES = new Intl.DisplayNames(['fr'], { type: 'region' });

/** French display name of an ISO alpha-2 country code (falls back to the code if unknown). */
export function countryLabelFr(code: string): string {
  return FR_REGION_NAMES.of(code) ?? code;
}

/**
 * Compose a partner card's `location` string:
 * - no country → null
 * - France with a région → the région (e.g. "Bretagne")
 * - France without a région → "France"
 * - any other country → its French name (e.g. "Japon")
 */
export function formatLocationFr(country: string | null, region: string | null): string | null {
  if (!country) return null;
  // "Région, Pays" for France when a région is set; otherwise just the country name.
  if (country === 'FR') return region ? `${region}, France` : 'France';
  return countryLabelFr(country);
}
