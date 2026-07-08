import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { CALL_FORMATS } from '@encre-et-plume/shared';
import type { CallFormat, SeatCounts } from '@encre-et-plume/shared';
import { IsFutureIsoDate, IsGenreIds, IsSeatCounts } from './create-call.dto';

/**
 * MC-7 round 3 — PATCH /calls/:id. Every field optional; the service requires ≥1 and enforces that
 * `status` (the close branch) is exclusive of any field edit. Per-field rules mirror CreateCallDto.
 */
export class UpdateCallDto {
  @IsOptional()
  @IsIn(['closed'], { message: "Seul le passage à 'closed' est permis." })
  status?: 'closed';

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Le titre est requis.' })
  @MaxLength(120, { message: 'Le titre est trop long (120 caractères max).' })
  title?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'La description est requise.' })
  @MaxLength(1000, { message: 'La description est trop longue (1000 caractères max).' })
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1, { message: 'Choisissez au moins un genre.' })
  @ArrayMaxSize(5, { message: 'Cinq genres maximum.' })
  @IsGenreIds()
  genres?: string[];

  @IsOptional()
  @IsIn(CALL_FORMATS, { message: 'Format invalide.' })
  format?: CallFormat;

  @IsOptional()
  @IsString()
  @MaxLength(60, { message: "L'ampleur est trop longue (60 caractères max)." })
  scope?: string;

  @IsOptional()
  @IsSeatCounts()
  seats?: SeatCounts;

  @IsOptional()
  @IsFutureIsoDate()
  deadline?: string;
}
