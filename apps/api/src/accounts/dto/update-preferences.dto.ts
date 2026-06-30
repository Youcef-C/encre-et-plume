import { IsIn } from 'class-validator';
import { THEME_PREFERENCES, type ThemePreference } from '@encre-et-plume/shared';

export class UpdatePreferencesDto {
  @IsIn(THEME_PREFERENCES)
  theme!: ThemePreference;
}
