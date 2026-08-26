/**
 * AccountErasureProcessor unit tests (F-14 + F-15).
 * Core RGPD safety net: asserts EVERY Account FK relation is handled.
 * FK erasure order: DataExport → PortfolioItem → Profile → Notifications → Media →
 *                   NotificationPreference → Tokens → tombstone Account.
 * ConsentRecord: KEPT (legal proof).
 */

import { AccountErasureProcessor } from './account-erasure.processor';
import { ANONYMIZED_DISPLAY_NAME } from '@encre-et-plume/shared';

const ACCOUNT_ID = 'acc-1';

const ACTIVE_ACCOUNT = {
  id: ACCOUNT_ID,
  displayName: 'Yuki Moreau',
  email: 'yuki@test.com',
  passwordHash: 'hash',
  profileSlug: 'yuki-moreau',
  avatar: 'avatar/acc-1/m.jpg',
  deletedAt: null,
};

// Tracks the order and calls made within the $transaction callback.
type TxCall = { model: string; op: string; args: unknown };
type TxModel = {
  deleteMany: jest.Mock;
  updateMany: jest.Mock;
  update: jest.Mock;
};
type Tx = Record<string, TxModel>;

function makePrisma() {
  const txCalls: TxCall[] = [];

  // tx object mirrors each model method and records calls in order
  const makeTxModel = (model: string): TxModel => ({
    deleteMany: jest.fn((args: unknown) => { txCalls.push({ model, op: 'deleteMany', args }); return Promise.resolve({}); }),
    updateMany: jest.fn((args: unknown) => { txCalls.push({ model, op: 'updateMany', args }); return Promise.resolve({}); }),
    update: jest.fn((args: unknown) => { txCalls.push({ model, op: 'update', args }); return Promise.resolve({}); }),
  });

  const tx: Tx = {
    dataExport: makeTxModel('dataExport'),
    portfolioItem: makeTxModel('portfolioItem'),
    profile: makeTxModel('profile'),
    notification: makeTxModel('notification'),
    media: makeTxModel('media'),
    notificationPreference: makeTxModel('notificationPreference'), // F-15
    supportTicket: makeTxModel('supportTicket'), // F-21
    emailVerificationToken: makeTxModel('emailVerificationToken'),
    passwordResetToken: makeTxModel('passwordResetToken'),
    account: makeTxModel('account'),
    event: makeTxModel('event'), // F-23
  };

  return {
    account: {
      findUnique: jest.fn().mockResolvedValue(ACTIVE_ACCOUNT),
    },
    $transaction: jest.fn(async (cb: (tx: Tx) => Promise<void>) => {
      await cb(tx);
    }),
    _tx: tx,
    _txCalls: txCalls,
  };
}

function makeMedia() {
  return { deleteAllOwnerMedia: jest.fn().mockResolvedValue(undefined) };
}

describe('AccountErasureProcessor', () => {
  let processor: AccountErasureProcessor;
  let prisma: ReturnType<typeof makePrisma>;
  let media: ReturnType<typeof makeMedia>;

  beforeEach(() => {
    prisma = makePrisma();
    media = makeMedia();

    processor = new AccountErasureProcessor(prisma as never, media as never);
  });

  it('has queue = "account-erasure"', () => {
    expect(processor.queue).toBe('account-erasure');
  });

  // ── Idempotency ────────────────────────────────────────────────────────────

  it('is idempotent: no-op when account displayName is already "Utilisateur supprimé"', async () => {
    prisma.account.findUnique.mockResolvedValue({
      ...ACTIVE_ACCOUNT,
      displayName: ANONYMIZED_DISPLAY_NAME,
    });

    await processor.process({ accountId: ACCOUNT_ID }, {} as never);

    expect(media.deleteAllOwnerMedia).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('is idempotent: no-op when account row is missing (already hard-deleted by prior run)', async () => {
    prisma.account.findUnique.mockResolvedValue(null);

    await processor.process({ accountId: ACCOUNT_ID }, {} as never);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // ── S3 best-effort ────────────────────────────────────────────────────────

  it('calls deleteAllOwnerMedia (S3 best-effort) before the DB transaction', async () => {
    let s3CallOrder = 0;
    let txCallOrder = 0;

    media.deleteAllOwnerMedia.mockImplementation(() => {
      s3CallOrder = 1;
      return Promise.resolve();
    });

    prisma.$transaction.mockImplementation(async (cb: (tx: Tx) => Promise<void>) => {
      txCallOrder = 2;
      await cb(prisma._tx);
    });

    await processor.process({ accountId: ACCOUNT_ID }, {} as never);

    expect(media.deleteAllOwnerMedia).toHaveBeenCalledWith(ACCOUNT_ID);
    expect(s3CallOrder).toBe(1);
    expect(txCallOrder).toBe(2);
  });

  // ── FK-by-FK erasure checklist ─────────────────────────────────────────────

  it('CHECKLIST: DataExport rows deleted', async () => {
    await processor.process({ accountId: ACCOUNT_ID }, {} as never);

    expect(prisma._tx.dataExport.deleteMany).toHaveBeenCalledWith({
      where: { accountId: ACCOUNT_ID },
    });
  });

  it('CHECKLIST: PortfolioItem rows deleted (children of Profile)', async () => {
    await processor.process({ accountId: ACCOUNT_ID }, {} as never);

    expect(prisma._tx.portfolioItem.deleteMany).toHaveBeenCalledWith({
      where: { profile: { accountId: ACCOUNT_ID } },
    });
  });

  it('CHECKLIST: Profile row deleted', async () => {
    await processor.process({ accountId: ACCOUNT_ID }, {} as never);

    expect(prisma._tx.profile.deleteMany).toHaveBeenCalledWith({
      where: { accountId: ACCOUNT_ID },
    });
  });

  it('CHECKLIST: received Notifications deleted (purge)', async () => {
    await processor.process({ accountId: ACCOUNT_ID }, {} as never);

    expect(prisma._tx.notification.deleteMany).toHaveBeenCalledWith({
      where: { recipientId: ACCOUNT_ID },
    });
  });

  it('CHECKLIST: sent Notifications sourceUserId nulled (anonymize, keep others inbox)', async () => {
    await processor.process({ accountId: ACCOUNT_ID }, {} as never);

    expect(prisma._tx.notification.updateMany).toHaveBeenCalledWith({
      where: { sourceUserId: ACCOUNT_ID },
      data: { sourceUserId: null },
    });
  });

  it('CHECKLIST: Media rows deleted (S3 bytes done above by deleteAllOwnerMedia)', async () => {
    await processor.process({ accountId: ACCOUNT_ID }, {} as never);

    expect(prisma._tx.media.deleteMany).toHaveBeenCalledWith({
      where: { ownerId: ACCOUNT_ID },
    });
  });

  it('CHECKLIST: EmailVerificationToken rows deleted', async () => {
    await processor.process({ accountId: ACCOUNT_ID }, {} as never);

    expect(prisma._tx.emailVerificationToken.deleteMany).toHaveBeenCalledWith({
      where: { accountId: ACCOUNT_ID },
    });
  });

  it('CHECKLIST: PasswordResetToken rows deleted', async () => {
    await processor.process({ accountId: ACCOUNT_ID }, {} as never);

    expect(prisma._tx.passwordResetToken.deleteMany).toHaveBeenCalledWith({
      where: { accountId: ACCOUNT_ID },
    });
  });

  it('CHECKLIST: NotificationPreference rows deleted (F-15 RGPD)', async () => {
    await processor.process({ accountId: ACCOUNT_ID }, {} as never);

    expect(prisma._tx.notificationPreference.deleteMany).toHaveBeenCalledWith({
      where: { accountId: ACCOUNT_ID },
    });
  });

  it('CHECKLIST: SupportTicket rows deleted (F-21 RGPD)', async () => {
    await processor.process({ accountId: ACCOUNT_ID }, {} as never);

    expect(prisma._tx.supportTicket.deleteMany).toHaveBeenCalledWith({
      where: { accountId: ACCOUNT_ID },
    });
  });

  it('CHECKLIST: ConsentRecord KEPT (legal proof, not deleted)', async () => {
    await processor.process({ accountId: ACCOUNT_ID }, {} as never);

    // consentRecord must never appear in txCalls (no delete, no update)
    const consentCalls = prisma._txCalls.filter((c) => c.model === 'consentRecord');
    expect(consentCalls).toHaveLength(0);
  });

  it('CHECKLIST: Account tombstoned with placeholder email/slug and null avatar', async () => {
    await processor.process({ accountId: ACCOUNT_ID }, {} as never);

    expect(prisma._tx.account.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ACCOUNT_ID },
        data: expect.objectContaining({
          displayName: ANONYMIZED_DISPLAY_NAME,
          email: `deleted+${ACCOUNT_ID}@deleted.encre-et-plume.invalid`,
          profileSlug: `deleted-${ACCOUNT_ID}`,
          avatar: null,
          deletedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('CHECKLIST: tombstone passwordHash is not the original (randomised)', async () => {
    await processor.process({ accountId: ACCOUNT_ID }, {} as never);

    const updateCall = prisma._tx.account.update.mock.calls[0]?.[0] as {
      data: { passwordHash: string };
    };
    expect(updateCall.data.passwordHash).not.toBe(ACTIVE_ACCOUNT.passwordHash);
    expect(typeof updateCall.data.passwordHash).toBe('string');
    expect(updateCall.data.passwordHash.length).toBeGreaterThan(0);
  });

  // ── FK order sanity ────────────────────────────────────────────────────────

  it('DataExport is deleted before Media (drop FK to Media first)', async () => {
    await processor.process({ accountId: ACCOUNT_ID }, {} as never);

    const dataExportIdx = prisma._txCalls.findIndex((c) => c.model === 'dataExport' && c.op === 'deleteMany');
    const mediaIdx = prisma._txCalls.findIndex((c) => c.model === 'media' && c.op === 'deleteMany');

    expect(dataExportIdx).toBeGreaterThanOrEqual(0);
    expect(mediaIdx).toBeGreaterThanOrEqual(0);
    expect(dataExportIdx).toBeLessThan(mediaIdx);
  });

  it('PortfolioItem is deleted before Profile (child-before-parent)', async () => {
    await processor.process({ accountId: ACCOUNT_ID }, {} as never);

    const piIdx = prisma._txCalls.findIndex((c) => c.model === 'portfolioItem' && c.op === 'deleteMany');
    const profIdx = prisma._txCalls.findIndex((c) => c.model === 'profile' && c.op === 'deleteMany');

    expect(piIdx).toBeLessThan(profIdx);
  });

  // ── F-23 B16 · audience events are ANONYMISED, never deleted ────────────────

  it('CHECKLIST: Event.accountId nulled (anonymize) — aggregates must stay correct', async () => {
    await processor.process({ accountId: ACCOUNT_ID }, {} as never);

    expect(prisma._tx.event.updateMany).toHaveBeenCalledWith({
      where: { accountId: ACCOUNT_ID },
      data: { accountId: null },
    });
  });

  it('B16 · never deletes the erased account\'s events', async () => {
    await processor.process({ accountId: ACCOUNT_ID }, {} as never);

    expect(prisma._tx.event.deleteMany).not.toHaveBeenCalled();
  });

  it('B16 · the anonymisation runs INSIDE the erasure transaction', async () => {
    await processor.process({ accountId: ACCOUNT_ID }, {} as never);

    expect(prisma._txCalls.some((c) => c.model === 'event' && c.op === 'updateMany')).toBe(true);
  });
});