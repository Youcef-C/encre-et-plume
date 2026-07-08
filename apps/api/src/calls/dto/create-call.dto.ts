import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  registerDecorator,
  type ValidationOptions,
} from 'class-validator';
import {
  CALL_FORMATS,
  CALL_MAX_DOCUMENTS,
  CALL_MAX_SAMPLES,
  CALL_MAX_SEATS_PER_ROLE,
  CREATOR_ROLES,
  GENRES,
} from '@encre-et-plume/shared';
import type { CallFormat, SeatCounts } from '@encre-et-plume/shared';

const GENRE_IDS = new Set(GENRES.map((g) => g.id));

/** Every array element must be a known F-20 GENRES id (trust boundary — never a free label). */
function IsGenreIds(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isGenreIds',
      target: object.constructor,
      propertyName,
      options: { message: 'Genre inconnu.', ...validationOptions },
      validator: {
        validate: (value: unknown) => Array.isArray(value) && value.every((v) => typeof v === 'string' && GENRE_IDS.has(v)),
      },
    });
  };
}

/**
 * MC-4X §8: seats = a plain object of role→count. Keys must be CREATOR_ROLES, values integers in
 * 1..CALL_MAX_SEATS_PER_ROLE, at least one seat total. (The service re-normalises defensively.)
 */
function IsSeatCounts(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isSeatCounts',
      target: object.constructor,
      propertyName,
      options: { message: 'Postes recherchés invalides.', ...validationOptions },
      validator: {
        validate: (value: unknown) => {
          if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
          const entries = Object.entries(value as Record<string, unknown>);
          if (entries.length === 0) return false;
          let total = 0;
          for (const [role, count] of entries) {
            if (!(CREATOR_ROLES as readonly string[]).includes(role)) return false;
            if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > CALL_MAX_SEATS_PER_ROLE) return false;
            total += count;
          }
          return total >= 1;
        },
      },
    });
  };
}

/** Deadline must be a parseable ISO date strictly in the future. */
function IsFutureIsoDate(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isFutureIsoDate',
      target: object.constructor,
      propertyName,
      options: { message: 'La date de clôture doit être future.', ...validationOptions },
      validator: {
        validate: (value: unknown) => {
          if (typeof value !== 'string') return false;
          const t = Date.parse(value);
          return Number.isFinite(t) && t > Date.now();
        },
      },
    });
  };
}

export class CreateCallDto {
  // MC-4X §8: authorRole is derived server-side from the profile — not accepted here.
  @IsSeatCounts()
  seats!: SeatCounts;

  @IsString()
  @IsNotEmpty({ message: 'Le titre est requis.' })
  @MaxLength(120, { message: 'Le titre est trop long (120 caractères max).' })
  title!: string;

  @IsString()
  @IsNotEmpty({ message: 'La description est requise.' })
  @MaxLength(1000, { message: 'La description est trop longue (1000 caractères max).' })
  description!: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Choisissez au moins un genre.' })
  @ArrayMaxSize(5, { message: 'Cinq genres maximum.' })
  @IsGenreIds()
  genres!: string[];

  @IsOptional()
  @IsIn(CALL_FORMATS, { message: 'Format invalide.' })
  format?: CallFormat;

  @IsOptional()
  @IsString()
  @MaxLength(60, { message: "L'ampleur est trop longue (60 caractères max)." })
  scope?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(CALL_MAX_SAMPLES, { message: "Cinq visuels d'exemple maximum." })
  @IsString({ each: true })
  sampleMediaIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(CALL_MAX_DOCUMENTS, { message: 'Trois documents maximum.' })
  @IsString({ each: true })
  documentMediaIds?: string[];

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsFutureIsoDate()
  deadline!: string;
}
