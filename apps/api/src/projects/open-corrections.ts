import type { CorrectionType, Prisma } from '@prisma/client';

/**
 * CS-26 — the ONE definition of "unresolved corrections", shared by the two invariant-checked
 * transitions: Corrections → PROPRE (`CorrectionsService.validate`) and Encrage → VALIDÉ
 * (`PagesService.updateStage`). Keeping the `where` in one place is what stops the two gates
 * drifting apart.
 *
 * Dependency-free module (no service imports), like `comment-mapper.ts`: `CorrectionsService`
 * already imports `PagesService`, so a helper living in either service would close the CommonJS
 * require cycle that broke DI boot once already (CS-5 r3 P0).
 */

/** "Open" = not yet `corrige`. The status half alone, for the nested include on a page relation
 *  (where `pageId` is already implied by the parent row). */
export const OPEN_CORRECTION_STATUS = { status: { not: 'corrige' as const } };

/** "Open" = filed on this page and not yet `corrige`. */
export const openCorrectionWhere = (pageId: string) => ({ pageId, ...OPEN_CORRECTION_STATUS });

export type OpenCorrectionRow = { filedAgainstVersion: number; asset: { currentVersion: number } };

/** The version qualifier: a correction filed against v2 of a file now at v5 has been superseded and
 *  no longer says "this file still has known problems". Only current-version rows count. */
export const tallyAgainstCurrent = (rows: OpenCorrectionRow[]): number =>
  rows.filter((c) => c.filedAgainstVersion === c.asset.currentVersion).length;

/** Feedback 2026-09-01 — the unique `type`s of the same against-current rows the tally counts, so
 *  the card can say WHICH file kind (« dessin » / « scénario ») still needs a correction. */
export const openTypesAgainstCurrent = (rows: (OpenCorrectionRow & { type: CorrectionType })[]): CorrectionType[] => [
  ...new Set(rows.filter((c) => c.filedAgainstVersion === c.asset.currentVersion).map((c) => c.type)),
];

/** The subset of PrismaService this helper touches. Structural on purpose: importing PrismaService
 *  would re-open the assets↔corrections↔pages require cycle this module exists to avoid. The Prisma
 *  ARG types are imported as `import type`, which is erased at compile time — no runtime require, no
 *  cycle — so the args are checked properly instead of being waved through as `never`. */
type CorrectionReader = {
  correction: {
    count(args: { where: Prisma.CorrectionWhereInput }): Promise<number>;
    findMany(args: Prisma.CorrectionFindManyArgs): Promise<unknown>;
  };
};

export async function countOpenCorrections(
  prisma: CorrectionReader,
  pageId: string,
  { againstCurrentVersionOnly }: { againstCurrentVersionOnly: boolean },
): Promise<number> {
  const where = openCorrectionWhere(pageId);
  if (!againstCurrentVersionOnly) return prisma.correction.count({ where });
  const rows = (await prisma.correction.findMany({
    where,
    select: { filedAgainstVersion: true, asset: { select: { currentVersion: true } } },
  })) as OpenCorrectionRow[];
  return tallyAgainstCurrent(rows);
}
