import { IsIn, IsNotEmpty, IsString } from 'class-validator';
import type { ConsentDto } from '@encre-et-plume/shared';
import { CONSENT_DOCUMENTS } from '@encre-et-plume/shared';

export class ConsentBodyDto implements ConsentDto {
  @IsIn(CONSENT_DOCUMENTS, { message: 'document must be one of: cgu, privacy' })
  document!: 'cgu' | 'privacy';

  @IsString()
  @IsNotEmpty()
  version!: string;
}
