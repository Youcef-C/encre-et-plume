import { isOldEnoughToSignUp, isPlausibleBirthdate, MIN_SIGNUP_AGE_YEARS } from '@encre-et-plume/shared';

/**
 * CGU art. 4 — âge minimum d'inscription : 15 ans (décision utilisateur, 2026-08-02).
 *
 * Avant ce changement, `signup.dto` ne validait que la PLAUSIBILITÉ de la date : une date rendant
 * l'utilisateur âgé de 10 ans était acceptée, alors que les documents publiés annonçaient 15.
 */
describe('âge minimum à l’inscription', () => {
  const NOW = new Date('2026-08-02T00:00:00.000Z');
  const birthdateForAge = (age: number) => {
    const d = new Date(NOW);
    d.setUTCFullYear(d.getUTCFullYear() - age);
    return d.toISOString().slice(0, 10);
  };

  it('le seuil est 15', () => {
    expect(MIN_SIGNUP_AGE_YEARS).toBe(15);
  });

  it('refuse un âge inférieur au seuil', () => {
    for (const age of [0, 10, 13, 14]) {
      expect(isOldEnoughToSignUp(birthdateForAge(age), NOW)).toBe(false);
    }
  });

  it('accepte à partir du seuil exactement, et au-delà', () => {
    for (const age of [15, 16, 18, 40]) {
      expect(isOldEnoughToSignUp(birthdateForAge(age), NOW)).toBe(true);
    }
  });

  it('la veille du 15e anniversaire est refusée, le jour même est accepté', () => {
    const eve = new Date(NOW);
    eve.setUTCFullYear(eve.getUTCFullYear() - 15);
    eve.setUTCDate(eve.getUTCDate() + 1); // anniversaire demain → 14 ans aujourd'hui
    expect(isOldEnoughToSignUp(eve.toISOString().slice(0, 10), NOW)).toBe(false);
    expect(isOldEnoughToSignUp(birthdateForAge(15), NOW)).toBe(true);
  });

  it('refuse toujours une date implausible, indépendamment de l’âge', () => {
    expect(isOldEnoughToSignUp('2030-01-01', NOW)).toBe(false); // futur
    expect(isOldEnoughToSignUp('1800-01-01', NOW)).toBe(false); // > 120 ans
    expect(isOldEnoughToSignUp('pas-une-date', NOW)).toBe(false);
  });

  /**
   * La MISE À JOUR d'une date de naissance reste régie par la seule plausibilité : refuser une
   * correction vers un âge réel inférieur à 15 ans pousserait le mineur à conserver une date fausse
   * au lieu de se signaler. Les CGU prévoient pour ce cas la suspension du compte.
   */
  it('n’impose pas le seuil à la mise à jour d’une date de naissance', () => {
    expect(isPlausibleBirthdate(birthdateForAge(10), NOW)).toBe(true);
    expect(isOldEnoughToSignUp(birthdateForAge(10), NOW)).toBe(false);
  });
});
