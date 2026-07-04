import { registerDecorator, type ValidationOptions } from 'class-validator';
import { isPlausibleBirthdate } from '@encre-et-plume/shared';

/**
 * DR-10: 'YYYY-MM-DD' format + plausibility (not future, not > 120y) via the shared helper —
 * single source of truth so BE validation and the FE's own client-side check never drift.
 * Shared by SignupDto (BE-8) and UpdateBirthdateDto (BE-9).
 */
export function IsPlausibleBirthdate(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isPlausibleBirthdate',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && isPlausibleBirthdate(value);
        },
      },
    });
  };
}
