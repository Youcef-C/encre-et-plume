import { IsNotEmpty, IsString } from 'class-validator';

/** MC-12: POST /conversations/:id/participants — the account to add to the group. */
export class AddParticipantDto {
  @IsString()
  @IsNotEmpty()
  accountId!: string;
}
