import { IsIn, IsString } from 'class-validator';
import type { BlockKind, CreateBlockRequest } from '@encre-et-plume/shared';

export class CreateBlockDto implements CreateBlockRequest {
  @IsString()
  userId!: string;

  @IsIn(['block', 'mute'])
  kind!: BlockKind;
}
