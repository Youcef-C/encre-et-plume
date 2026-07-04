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

/** Plausibility only (DR-10 sets no minimum signup age): not in the future, not > 120 years ago. */
export function isPlausibleBirthdate(value: string, now: Date = new Date()): boolean {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return false;
  if (d.getTime() > now.getTime()) return false;
  return computeAge(d, now) <= MAX_AGE_YEARS;
}
