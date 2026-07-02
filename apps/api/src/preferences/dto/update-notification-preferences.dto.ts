import { IsArray, IsBoolean, IsIn, IsNotEmpty, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import type { NotificationPrefType, NotificationChannel } from '@encre-et-plume/shared';

const VALID_TYPES: NotificationPrefType[] = ['messages', 'applications', 'reactions', 'account', 'moderation'];
const VALID_CHANNELS: NotificationChannel[] = ['in_app', 'email'];

export class PreferenceChangeDto {
  @IsIn(VALID_TYPES)
  type!: NotificationPrefType;

  @IsIn(VALID_CHANNELS)
  channel!: NotificationChannel;

  @IsBoolean()
  enabled!: boolean;
}

export class UpdateNotificationPreferencesDto {
  @IsArray()
  @IsNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => PreferenceChangeDto)
  changes!: PreferenceChangeDto[];
}
