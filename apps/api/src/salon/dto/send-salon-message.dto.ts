import { IsString } from 'class-validator';

/**
 * POST /salon/messages body. Boundary type check only — trimming, emptiness and length are enforced in
 * SalonService (unit-tested + defense-in-depth against a caller that skips the pipe), matching MC-9.
 */
export class SendSalonMessageDto {
  @IsString()
  body!: string;
}
