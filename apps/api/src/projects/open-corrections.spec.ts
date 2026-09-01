import { countOpenCorrections, openCorrectionWhere, openTypesAgainstCurrent, tallyAgainstCurrent } from './open-corrections';

describe('open-corrections (CS-26 — the one definition of "unresolved")', () => {
  describe('openCorrectionWhere', () => {
    it('is "not corrige" on the page — the same rule the PROPRE validate applies', () => {
      expect(openCorrectionWhere('page-1')).toEqual({ pageId: 'page-1', status: { not: 'corrige' } });
    });
  });

  describe('tallyAgainstCurrent', () => {
    it('counts only corrections filed against the asset current version', () => {
      expect(
        tallyAgainstCurrent([
          { filedAgainstVersion: 5, asset: { currentVersion: 5 } },
          { filedAgainstVersion: 2, asset: { currentVersion: 5 } }, // superseded
          { filedAgainstVersion: 1, asset: { currentVersion: 1 } },
        ]),
      ).toBe(2);
    });

    it('is 0 for no rows and for superseded-only rows', () => {
      expect(tallyAgainstCurrent([])).toBe(0);
      expect(tallyAgainstCurrent([{ filedAgainstVersion: 2, asset: { currentVersion: 5 } }])).toBe(0);
    });
  });

  // Feedback 2026-09-01 — the card face names WHICH file types still have open corrections.
  describe('openTypesAgainstCurrent', () => {
    it('returns the unique types of against-current rows, superseded excluded', () => {
      expect(
        openTypesAgainstCurrent([
          { filedAgainstVersion: 5, asset: { currentVersion: 5 }, type: 'dessin' },
          { filedAgainstVersion: 5, asset: { currentVersion: 5 }, type: 'dessin' }, // duplicate type
          { filedAgainstVersion: 1, asset: { currentVersion: 1 }, type: 'scenario' },
          { filedAgainstVersion: 2, asset: { currentVersion: 5 }, type: 'scenario' }, // superseded
        ]),
      ).toEqual(['dessin', 'scenario']);
    });

    it('is empty for no rows and for superseded-only rows', () => {
      expect(openTypesAgainstCurrent([])).toEqual([]);
      expect(openTypesAgainstCurrent([{ filedAgainstVersion: 2, asset: { currentVersion: 5 }, type: 'dessin' }])).toEqual([]);
    });
  });

  describe('countOpenCorrections', () => {
    const prisma = () => ({
      correction: {
        count: jest.fn().mockResolvedValue(3),
        findMany: jest.fn().mockResolvedValue([
          { filedAgainstVersion: 5, asset: { currentVersion: 5 } },
          { filedAgainstVersion: 2, asset: { currentVersion: 5 } },
        ]),
      },
    });

    it('uses a plain count for the unqualified (PROPRE) path', async () => {
      const p = prisma();
      await expect(countOpenCorrections(p, 'page-1', { againstCurrentVersionOnly: false })).resolves.toBe(3);
      expect(p.correction.count).toHaveBeenCalledWith({ where: { pageId: 'page-1', status: { not: 'corrige' } } });
      expect(p.correction.findMany).not.toHaveBeenCalled();
    });

    it('reads versions and tallies only current-version rows for the VALIDÉ path', async () => {
      const p = prisma();
      await expect(countOpenCorrections(p, 'page-1', { againstCurrentVersionOnly: true })).resolves.toBe(1);
      expect(p.correction.findMany).toHaveBeenCalledWith({
        where: { pageId: 'page-1', status: { not: 'corrige' } },
        select: { filedAgainstVersion: true, asset: { select: { currentVersion: true } } },
      });
      expect(p.correction.count).not.toHaveBeenCalled();
    });
  });
});
