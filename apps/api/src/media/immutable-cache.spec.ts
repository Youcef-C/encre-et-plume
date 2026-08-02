import { IMMUTABLE_CACHE_CONTROL } from './s3-storage.service';

/**
 * Contrôle des coûts (demande utilisateur, 2026-08-02) : une planche de manga ne change jamais après
 * publication, et elle est lourde et très lue. L'en-tête `immutable` supprime la revalidation, donc
 * l'aller-retour lui-même, pas seulement le transfert.
 *
 * La sûreté de `immutable` repose ENTIÈREMENT sur la non-réutilisation des clés : `bucketKey` contient
 * un uuidv7 propre à chaque téléversement. Si un jour une clé était réécrite avec un contenu différent,
 * les lecteurs serviraient l'ancienne image pendant un an sans aucun moyen de l'invalider.
 */
describe('IMMUTABLE_CACHE_CONTROL', () => {
  it('est public, sur un an, et immutable', () => {
    expect(IMMUTABLE_CACHE_CONTROL).toContain('public');
    expect(IMMUTABLE_CACHE_CONTROL).toContain('immutable');
    expect(IMMUTABLE_CACHE_CONTROL).toMatch(/max-age=(\d+)/);
    const maxAge = Number(/max-age=(\d+)/.exec(IMMUTABLE_CACHE_CONTROL)![1]);
    expect(maxAge).toBeGreaterThanOrEqual(31536000); // >= 1 an
  });

  it('ne contient aucune directive qui forcerait une revalidation', () => {
    expect(IMMUTABLE_CACHE_CONTROL).not.toMatch(/no-cache|no-store|must-revalidate|max-age=0/);
  });
});
