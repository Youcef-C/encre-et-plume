import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AccountsService } from './accounts.service';
import { PrismaService } from '../prisma/prisma.service';
import { MediaService } from '../media/media.service';

const BASE_ACCOUNT = {
  id: 'cuid-1',
  displayName: 'Yuki Moreau',
  email: 'yuki@test.com',
  passwordHash: 'hash',
  role: 'utilisateur' as const,
  verified: false,
  profileSlug: 'yuki-moreau',
  avatar: null,
  preferences: { theme: 'system' },
  createdAt: new Date('2026-01-01'),
  birthdate: null, // DR-10: null = not yet declared
};

const READY_MEDIA = {
  id: 'media-1',
  kind: 'avatar' as const,
  status: 'ready' as const,
  visibility: 'public' as const,
  width: 320,
  height: 320,
  variants: { orig: 'https://cdn/orig', web: 'https://cdn/web.webp', thumb: 'https://cdn/thumb.webp' },
  createdAt: '2026-06-01T00:00:00.000Z',
};

describe('AccountsService', () => {
  let service: AccountsService;
  let prisma: { account: { findUnique: jest.Mock; update: jest.Mock } };
  let media: { getForOwner: jest.Mock; deleteOwnerAvatarMedia: jest.Mock };

  beforeEach(() => {
    prisma = { account: { findUnique: jest.fn(), update: jest.fn() } };
    media = { getForOwner: jest.fn().mockResolvedValue(READY_MEDIA), deleteOwnerAvatarMedia: jest.fn().mockResolvedValue(undefined) };
    service = new AccountsService(prisma as unknown as PrismaService, media as unknown as MediaService);
  });

  it('F-17: toSummary includes onboarded:false (hardcoded like needsCguReconsent)', async () => {
    prisma.account.findUnique.mockResolvedValue(BASE_ACCOUNT);
    prisma.account.update.mockResolvedValue(BASE_ACCOUNT);
    const result = await service.updateRole('cuid-1', 'utilisateur');
    expect(result.onboarded).toBe(false);
  });

  it('updates role and returns AccountSummary (BE-AC4, BE-AC7)', async () => {
    const updated = { ...BASE_ACCOUNT, role: 'editor' as const, verified: false };
    prisma.account.findUnique.mockResolvedValue(BASE_ACCOUNT);
    prisma.account.update.mockResolvedValue(updated);

    const result = await service.updateRole('cuid-1', 'editor');

    expect(prisma.account.update).toHaveBeenCalledWith({
      where: { id: 'cuid-1' },
      data: { role: 'editor' },
    });
    expect(result.role).toBe('editor');
    expect(result.verified).toBe(false);
  });

  it('throws NotFoundException for unknown account id (BE-AC5 404 branch)', async () => {
    prisma.account.findUnique.mockResolvedValue(null);
    await expect(service.updateRole('bad-id', 'admin')).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('DR-10: isAdult derivation', () => {
    it('returns isAdult: null when birthdate is not on file', async () => {
      prisma.account.findUnique.mockResolvedValue(BASE_ACCOUNT);
      prisma.account.update.mockResolvedValue(BASE_ACCOUNT);
      const result = await service.updateRole('cuid-1', 'utilisateur');
      expect(result.isAdult).toBeNull();
    });

    it('returns isAdult: true for an adult birthdate', async () => {
      const updated = { ...BASE_ACCOUNT, birthdate: new Date('1990-01-01') };
      prisma.account.findUnique.mockResolvedValue(BASE_ACCOUNT);
      prisma.account.update.mockResolvedValue(updated);
      const result = await service.updateRole('cuid-1', 'utilisateur');
      expect(result.isAdult).toBe(true);
    });
  });

  describe('DR-10 BE-9: setBirthdate', () => {
    it('persists the birthdate as a Date and returns the refreshed AccountSummary with recomputed isAdult', async () => {
      const updated = { ...BASE_ACCOUNT, birthdate: new Date('1990-01-01') };
      prisma.account.update.mockResolvedValue(updated);

      const result = await service.setBirthdate('cuid-1', '1990-01-01');

      expect(prisma.account.update).toHaveBeenCalledWith({
        where: { id: 'cuid-1' },
        data: { birthdate: new Date('1990-01-01') },
      });
      expect(result.isAdult).toBe(true);
    });

    it('recomputes isAdult: false for a minor birthdate', async () => {
      const now = new Date();
      const minorBirthdate = new Date(now.getFullYear() - 10, now.getMonth(), now.getDate());
      prisma.account.update.mockResolvedValue({ ...BASE_ACCOUNT, birthdate: minorBirthdate });

      const result = await service.setBirthdate('cuid-1', minorBirthdate.toISOString().slice(0, 10));

      expect(result.isAdult).toBe(false);
    });
  });

  describe('getBirthdate', () => {
    it('returns the caller own birthdate formatted as YYYY-MM-DD', async () => {
      prisma.account.findUnique.mockResolvedValue({ birthdate: new Date('1990-01-01') });

      const result = await service.getBirthdate('cuid-1');

      expect(result).toEqual({ birthdate: '1990-01-01' });
    });

    it('returns birthdate: null when not yet declared', async () => {
      prisma.account.findUnique.mockResolvedValue({ birthdate: null });

      const result = await service.getBirthdate('cuid-1');

      expect(result).toEqual({ birthdate: null });
    });

    it('scopes the lookup to the given accountId only (never another account)', async () => {
      prisma.account.findUnique.mockResolvedValue({ birthdate: null });

      await service.getBirthdate('cuid-1');

      expect(prisma.account.findUnique).toHaveBeenCalledWith({ where: { id: 'cuid-1' }, select: { birthdate: true } });
    });

    it('throws NotFoundException for an unknown account id', async () => {
      prisma.account.findUnique.mockResolvedValue(null);
      await expect(service.getBirthdate('bad-id')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('F-6 + F-19: updatePreferences (merge, not overwrite)', () => {
    it('persists theme and returns AccountSummary with updated preference', async () => {
      prisma.account.findUnique.mockResolvedValue({ preferences: { theme: 'system', dmPolicy: 'requests' } });
      const updated = { ...BASE_ACCOUNT, preferences: { theme: 'dark', dmPolicy: 'requests' } };
      prisma.account.update.mockResolvedValue(updated);

      const result = await service.updatePreferences('cuid-1', { theme: 'dark' });

      expect(prisma.account.update).toHaveBeenCalledWith({
        where: { id: 'cuid-1' },
        data: { preferences: { theme: 'dark', dmPolicy: 'requests' } },
      });
      expect(result.preferences).toEqual({ theme: 'dark', dmPolicy: 'requests' });
      expect(result.id).toBe('cuid-1');
    });

    it('handles absent preferences column gracefully (defaults theme=system, dmPolicy=requests)', async () => {
      prisma.account.findUnique.mockResolvedValue({ preferences: null });
      const updated = { ...BASE_ACCOUNT, preferences: { theme: 'system' } };
      prisma.account.update.mockResolvedValue(updated);

      const result = await service.updatePreferences('cuid-1', { theme: 'system' });
      expect(result.preferences).toEqual({ theme: 'system', dmPolicy: 'requests' });
    });

    // J12 — the merge fix + F-19 field
    it('J12: setting dmPolicy preserves the stored theme (merge, not whole-JSON overwrite)', async () => {
      prisma.account.findUnique.mockResolvedValue({ preferences: { theme: 'dark' } });
      prisma.account.update.mockResolvedValue({ ...BASE_ACCOUNT, preferences: { theme: 'dark', dmPolicy: 'contacts' } });

      const result = await service.updatePreferences('cuid-1', { dmPolicy: 'contacts' });

      expect(prisma.account.update).toHaveBeenCalledWith({
        where: { id: 'cuid-1' },
        data: { preferences: { theme: 'dark', dmPolicy: 'contacts' } },
      });
      expect(result.preferences).toEqual({ theme: 'dark', dmPolicy: 'contacts' });
    });

    it('J12: setting theme preserves the stored dmPolicy', async () => {
      prisma.account.findUnique.mockResolvedValue({ preferences: { theme: 'system', dmPolicy: 'contacts' } });
      prisma.account.update.mockResolvedValue({ ...BASE_ACCOUNT, preferences: { theme: 'light', dmPolicy: 'contacts' } });

      const result = await service.updatePreferences('cuid-1', { theme: 'light' });

      expect(prisma.account.update).toHaveBeenCalledWith({
        where: { id: 'cuid-1' },
        data: { preferences: { theme: 'light', dmPolicy: 'contacts' } },
      });
      expect(result.preferences).toEqual({ theme: 'light', dmPolicy: 'contacts' });
    });

    it('J12: summary defaults dmPolicy to "requests" when the key is absent', async () => {
      prisma.account.findUnique.mockResolvedValue({ preferences: { theme: 'dark' } });
      prisma.account.update.mockResolvedValue({ ...BASE_ACCOUNT, preferences: { theme: 'dark' } });

      const result = await service.updatePreferences('cuid-1', { theme: 'dark' });
      expect(result.preferences.dmPolicy).toBe('requests');
    });

    it('rejects a body with neither theme nor dmPolicy (400)', async () => {
      await expect(service.updatePreferences('cuid-1', {})).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ── B8: setAvatar ─────────────────────────────────────────────────────────

  describe('F-10: setAvatar()', () => {
    it('sets Account.avatar to variants.web and returns AccountSummary on happy path', async () => {
      const updated = { ...BASE_ACCOUNT, avatar: 'https://cdn/web.webp' };
      prisma.account.update.mockResolvedValue(updated);

      const result = await service.setAvatar('cuid-1', 'media-1');

      expect(media.getForOwner).toHaveBeenCalledWith('cuid-1', 'media-1');
      expect(prisma.account.update).toHaveBeenCalledWith({
        where: { id: 'cuid-1' },
        data: { avatar: 'https://cdn/web.webp' },
      });
      expect(result.avatar).toBe('https://cdn/web.webp');
    });

    it('deletes prior avatar media after setting (RGPD: no orphaned bytes)', async () => {
      const updated = { ...BASE_ACCOUNT, avatar: 'https://cdn/web.webp' };
      prisma.account.update.mockResolvedValue(updated);

      await service.setAvatar('cuid-1', 'media-1');

      // Must clean up OTHER avatar media (id ≠ 'media-1')
      expect(media.deleteOwnerAvatarMedia).toHaveBeenCalledWith('cuid-1', 'media-1');
    });

    it('throws 400 when media kind is not avatar', async () => {
      media.getForOwner.mockResolvedValue({ ...READY_MEDIA, kind: 'cover' });

      await expect(service.setAvatar('cuid-1', 'media-1')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws 409 when media status is not ready (still pending/processing)', async () => {
      media.getForOwner.mockResolvedValue({ ...READY_MEDIA, status: 'pending' });

      await expect(service.setAvatar('cuid-1', 'media-1')).rejects.toBeInstanceOf(ConflictException);
    });

    it('propagates ForbiddenException from getForOwner (non-owner media)', async () => {
      const { ForbiddenException } = await import('@nestjs/common');
      media.getForOwner.mockRejectedValue(new ForbiddenException());

      await expect(service.setAvatar('cuid-1', 'other-media')).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  // ── F-10: deleteAvatar ────────────────────────────────────────────────────

  describe('F-10: deleteAvatar()', () => {
    it('deletes all owner avatar media, sets Account.avatar=null, returns AccountSummary', async () => {
      const updated = { ...BASE_ACCOUNT, avatar: null };
      prisma.account.update.mockResolvedValue(updated);

      const result = await service.deleteAvatar('cuid-1');

      expect(media.deleteOwnerAvatarMedia).toHaveBeenCalledWith('cuid-1');
      expect(prisma.account.update).toHaveBeenCalledWith({
        where: { id: 'cuid-1' },
        data: { avatar: null },
      });
      expect(result.avatar).toBeNull();
    });

    it('still clears Account.avatar even when deleteOwnerAvatarMedia returns without rows', async () => {
      media.deleteOwnerAvatarMedia.mockResolvedValue(undefined);
      const updated = { ...BASE_ACCOUNT, avatar: null };
      prisma.account.update.mockResolvedValue(updated);

      const result = await service.deleteAvatar('cuid-1');
      expect(result.avatar).toBeNull();
    });

    // ── ACID: null the column BEFORE deleting bytes — a crash in between must never
    //    leave Account.avatar pointing at a deleted S3 object ──

    it('nulls Account.avatar BEFORE deleting the media (no dangling URL on mid-crash)', async () => {
      const updated = { ...BASE_ACCOUNT, avatar: null };
      prisma.account.update.mockResolvedValue(updated);

      await service.deleteAvatar('cuid-1');

      const updateOrder = prisma.account.update.mock.invocationCallOrder[0];
      const deleteOrder = media.deleteOwnerAvatarMedia.mock.invocationCallOrder[0];
      expect(updateOrder).toBeLessThan(deleteOrder!);
    });

    it('still returns avatar=null when media cleanup fails (best-effort, like setAvatar)', async () => {
      const updated = { ...BASE_ACCOUNT, avatar: null };
      prisma.account.update.mockResolvedValue(updated);
      media.deleteOwnerAvatarMedia.mockRejectedValue(new Error('s3 down'));

      const result = await service.deleteAvatar('cuid-1');
      expect(result.avatar).toBeNull();
    });
  });
});
