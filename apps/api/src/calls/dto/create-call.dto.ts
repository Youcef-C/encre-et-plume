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
import { CALL_DIRECTIONS, CALL_FORMATS, GENRES } from '@encre-et-plume/shared';
import type { CallDirection, CallFormat } from '@encre-et-plume/shared';

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
  @IsIn(CALL_DIRECTIONS, { message: 'Direction invalide.' })
  direction!: CallDirection;

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
  @IsString()
  sampleMediaId?: string;

  @IsFutureIsoDate()
  deadline!: string;
}
