import { IsNotEmpty, IsString } from 'class-validator';

/** MC-8 — send a connection request. `toUser` = the target Account id. */
export class CreateConnectionRequestDto {
  @IsString()
  @IsNotEmpty()
  toUser!: string;
}
