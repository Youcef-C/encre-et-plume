import {
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SUPPORT_CATEGORIES } from '@encre-et-plume/shared';
import type { SupportCategory } from '@encre-et-plume/shared';

// F-21: relies on the global ValidationPipe({ whitelist: true }) in main.ts to strip unknown keys.
class SupportTicketContextDto {
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  userAgent?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  requestId?: string;
}

export class CreateSupportTicketDto {
  @IsIn([...SUPPORT_CATEGORIES])
  category!: SupportCategory;

  @IsString()
  @IsNotEmpty({ message: 'Nom requis' })
  @MaxLength(100)
  name!: string;

  @IsEmail({}, { message: 'Adresse e-mail invalide' })
  @MaxLength(254)
  email!: string;

  @IsString()
  @IsNotEmpty({ message: 'Message requis' })
  @MaxLength(5000)
  message!: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => SupportTicketContextDto)
  context?: SupportTicketContextDto;

  // Honeypot — named to look real to bots; the controller rejects when non-empty.
  @IsOptional()
  @IsString()
  website?: string;
}
