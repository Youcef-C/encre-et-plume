import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { APPLICATION_MAX_SAMPLES, APPLICATION_MESSAGE_MAX } from '@encre-et-plume/shared';
import { ApplicationSampleRefDto } from './apply-to-call.dto';

/**
 * PATCH /me/applications/:id body — edit the caller's own PENDING application. Same sample shape/bounds
 * as apply (1..APPLICATION_MAX_SAMPLES mixed refs; XOR + ownership/kind checks live in the service).
 * No `appliedAs`, no `callId` — the call and applicant are never editable here.
 */
export class EditApplicationDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Ajoutez un échantillon de votre travail.' })
  @ArrayMaxSize(APPLICATION_MAX_SAMPLES, { message: 'Trois échantillons maximum.' })
  @ValidateNested({ each: true })
  @Type(() => ApplicationSampleRefDto)
  samples!: ApplicationSampleRefDto[];

  @IsOptional()
  @IsString()
  @MaxLength(APPLICATION_MESSAGE_MAX, { message: 'Le message est trop long (1000 caractères max).' })
  message?: string;
}
