import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * POST /salon/messages body. Boundary type check only — trimming, emptiness and length are enforced in
 * SalonService (unit-tested + defense-in-depth against a caller that skips the pipe), matching MC-9.
 */
export class SendSalonMessageDto {
  @IsString()
  body!: string;

  /** MC-15: quote a message of the salon — cross-conversation targets are a 400. */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  replyToId?: string;
}
