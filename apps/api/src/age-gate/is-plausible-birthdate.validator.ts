import { registerDecorator, type ValidationOptions } from 'class-validator';
import { MIN_SIGNUP_AGE_YEARS, computeAge, isPlausibleBirthdate } from '@encre-et-plume/shared';

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

/**
 * Âge minimum à l'INSCRIPTION (CGU art. 4). Décorateur distinct de `IsPlausibleBirthdate`, qui reste
 * la règle appliquée à la mise à jour d'une date de naissance — voir `isOldEnoughToSignUp`.
 */
export function IsSignupAge(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isSignupAge',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          // Ne juge QUE l'âge. Une date absente, malformée, future ou implausible n'est pas de son
          // ressort : `IsPlausibleBirthdate`, posé sur le même champ, répond « Date invalide » pour
          // ces cas. Sans cette séparation, une date malformée annoncerait « vous devez avoir 15
          // ans », ce qui est faux et déroutant.
          if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return true;
          if (!isPlausibleBirthdate(value)) return true;
          return computeAge(value) >= MIN_SIGNUP_AGE_YEARS;
        },
      },
    });
  };
}
