import { IsIn, IsOptional } from 'class-validator';
import { THEME_PREFERENCES, DM_POLICIES, type ThemePreference, type DmPolicy } from '@encre-et-plume/shared';

// F-6 theme + F-19 dmPolicy. Both optional; the service rejects a body with neither (merge, not overwrite).
export class UpdatePreferencesDto {
  @IsOptional()
  @IsIn(THEME_PREFERENCES)
  theme?: ThemePreference;

  @IsOptional()
  @IsIn(DM_POLICIES)
  dmPolicy?: DmPolicy;
}
