// DR-10: shared age helpers — single source of truth for BE (signup/gating) and FE (interstitial),
// so the "am I 18?" calculation never drifts between client and server.

const MAX_AGE_YEARS = 120;

/** Calendar-correct age (month/day aware, not a naive year subtraction). */
export function computeAge(birthdate: string | Date, now: Date = new Date()): number {
  const b = typeof birthdate === 'string' ? new Date(birthdate) : birthdate;
  let age = now.getUTCFullYear() - b.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - b.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < b.getUTCDate())) {
    age -= 1;
  }
  return age;
}

/** null in -> null out (no birthdate on file); else true iff computeAge(...) >= 18. */
export function deriveIsAdult(birthdate: string | Date | null, now: Date = new Date()): boolean | null {
  if (birthdate === null) return null;
  return computeAge(birthdate, now) >= 18;
}

/**
 * Âge minimum d'inscription (décision utilisateur, 2026-08-02 ; CGU art. 4).
 *
 * 15 ans est le seuil français à partir duquel un mineur consent SEUL au traitement de ses données
 * (art. 8 RGPD, art. 45 loi n° 78-17). En dessous, il faudrait recueillir, vérifier, conserver et
 * pouvoir révoquer le consentement conjoint d'un titulaire de l'autorité parentale — mécanique que
 * ce seuil supprime entièrement. Ne pas l'abaisser sans construire ce recueil.
 */
export const MIN_SIGNUP_AGE_YEARS = 15;

/**
 * Éligibilité à l'inscription : plausible ET au moins MIN_SIGNUP_AGE_YEARS.
 *
 * Volontairement distinct de `isPlausibleBirthdate` : celle-ci reste la règle de la MISE À JOUR d'une
 * date de naissance. Refuser une correction vers un âge réel inférieur à 15 ans pousserait le mineur
 * à conserver une date fausse au lieu de se signaler ; les CGU prévoient pour ce cas la suspension du
 * compte, pas le rejet de la correction.
 */
export function isOldEnoughToSignUp(value: string, now: Date = new Date()): boolean {
  if (!isPlausibleBirthdate(value, now)) return false;
  return computeAge(value, now) >= MIN_SIGNUP_AGE_YEARS;
}

/** Plausibility only (DR-10 sets no minimum signup age): not in the future, not > 120 years ago. */
export function isPlausibleBirthdate(value: string, now: Date = new Date()): boolean {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  if (d.getTime() > now.getTime()) return false;
  return computeAge(d, now) <= MAX_AGE_YEARS;
}
