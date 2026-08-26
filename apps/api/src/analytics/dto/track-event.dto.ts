import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * F-23 B7 — the ONLY event body a browser may send. `read` / `signup` / `publish` are emitted
 * server-side where the write already happens, so accepting them here would let anyone forge the
 * signup and reading series. `at`, `visitorId` and `accountId` are server-stamped and are stripped
 * by the global `ValidationPipe({ whitelist: true })` if a client sends them anyway (D-5).
 */
export class TrackEventDto {
  @IsIn(['visit'], { message: 'Type d’évènement non pris en charge' })
  kind!: 'visit';

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  path?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  ref?: string;
}
