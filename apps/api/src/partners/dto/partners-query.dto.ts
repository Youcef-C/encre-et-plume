import { IsIn, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';
import type { CreatorRole, PartnerAvailability } from '@encre-et-plume/shared';
import { CREATOR_ROLES, PARTNER_LOCATION_TOKENS, PARTNER_AVAILABILITY_KEYS, GENRES } from '@encre-et-plume/shared';

const GENRE_IDS = GENRES.map((g) => g.id);

// Nest delivers a repeated query key as an array, but a lone key (`?genres=josei`) as a bare string.
// Wrap the single string into a one-element array so `each: true` validation is uniform.
const toArray = ({ value }: { value: unknown }): unknown =>
  value === undefined || value === null || Array.isArray(value) ? value : [value];

/**
 * GET /partners query validation. Enum fields are 400-rejected on unknown values (story rule);
 * `genres`/`locations` reject the whole facet if ANY element is unknown (per-element `IsIn`).
 * `locations[]` tokens are a mix of continent French names, ISO alpha-2 country codes, and French
 * régions (see PARTNER_LOCATION_TOKENS). `page`/`pageSize` are NOT validated here — they are parsed
 * leniently + clamped in the service (bad page → 1, pageSize clamps to max, never a 400).
 */
export class PartnersQueryDto {
  @IsOptional()
  @IsIn([...CREATOR_ROLES])
  role?: CreatorRole;

  @IsOptional()
  @Transform(toArray)
  @IsIn(GENRE_IDS, { each: true })
  genres?: string[];

  @IsOptional()
  @Transform(toArray)
  @IsIn(PARTNER_LOCATION_TOKENS, { each: true })
  locations?: string[];

  @IsOptional()
  @IsIn([...PARTNER_AVAILABILITY_KEYS])
  availability?: PartnerAvailability;
}
