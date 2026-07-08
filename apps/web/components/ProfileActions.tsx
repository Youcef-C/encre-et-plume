'use client';

// F-7 — Visitor action buttons. Suivre / Se connecter / Soutenir stay presentational stubs
// (PUB-4 / MC-8 / MR-1). MC-3 wires "Proposer une collab" to the shared invite modal:
// anonymous visitors are redirected to /connexion; signed-in visitors open the modal prefilled
// with this profile as recipient (the server rejects self-invites regardless).
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AccountSummary, ProfileResponse, ApiError } from '@encre-et-plume/shared';
import { StarIcon } from './icons';
import InviteModal, { type InviteRecipient } from './collab/InviteModal';
import OverflowMenu, { MenuItem } from './OverflowMenu';
import BlockConfirmModal from './blocks/BlockConfirmModal';
import { deleteBlock } from '../lib/api';

export default function ProfileActions({
  profile,
  account,
  hasBlocked: hasBlockedProp,
  onBlockedChange,
}: {
  profile: ProfileResponse;
  account: AccountSummary | null;
  // MC-10 round 2 (F9) — block state can be lifted to the parent so the "Bloqué" pill renders
  // next to the name (ProfilePageClient) while the block/unblock actions stay here. Controlled
  // when `hasBlocked` is passed; falls back to internal state otherwise (standalone/tests).
  hasBlocked?: boolean;
  onBlockedChange?: (blocked: boolean) => void;
}) {
  const router = useRouter();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uncontrolledBlocked, setUncontrolledBlocked] = useState(Boolean(profile.viewerHasBlocked));
  const hasBlocked = hasBlockedProp !== undefined ? hasBlockedProp : uncontrolledBlocked;
  const setHasBlocked = (blocked: boolean) => {
    setUncontrolledBlocked(blocked);
    onBlockedChange?.(blocked);
  };
  async function handleUnblock() {
    setError(null);
    setNotice(null);
    try {
      await deleteBlock(profile.userId, 'block');
      setHasBlocked(false);
      setNotice('Compte débloqué.');
    } catch (e) {
      setError((e as ApiError).message);
    }
  }

  const recipient: InviteRecipient = {
    userId: profile.userId,
    name: profile.displayName,
    avatarUrl: profile.avatar,
    subtitle: profile.roleLine,
  };

  const handleProposer = () => {
    if (!account) {
      router.push('/connexion');
      return;
    }
    setInviteOpen(true);
  };

  // Overflow (block) is only meaningful for a signed-in visitor viewing someone else's profile.
  const canBlock = Boolean(account) && account?.id !== profile.userId;

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}>
      <button
        type="button"
        className="ep-btn-secondary"
        style={{ fontSize: 13, padding: '7px 14px' }}
      >
        Suivre
      </button>
      <button
        type="button"
        className="ep-btn-secondary"
        style={{ fontSize: 13, padding: '7px 14px' }}
      >
        ＋ Se connecter
      </button>
      <button
        type="button"
        className="ep-btn-primary"
        style={{ fontSize: 13, padding: '7px 14px' }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <StarIcon size={14} /> Soutenir
        </span>
      </button>
      <button
        type="button"
        onClick={handleProposer}
        className="ep-btn-secondary"
        style={{ fontSize: 13, padding: '7px 14px' }}
      >
        Proposer une collab
      </button>

      {/* MC-10 (F9): the "Bloqué" pill is rendered next to the name by ProfilePageClient, not in
          this action row (it crowded the buttons). The overflow below still flips Bloquer/Débloquer. */}
      {canBlock && (
        <OverflowMenu label={`Plus d'actions sur le profil de ${profile.displayName}`}>
          {(close) =>
            hasBlocked ? (
              <MenuItem
                accent
                ariaLabel={`Débloquer ${profile.displayName}`}
                onClick={() => {
                  close();
                  void handleUnblock();
                }}
              >
                Débloquer
              </MenuItem>
            ) : (
              <MenuItem
                accent
                onClick={() => {
                  close();
                  setBlockOpen(true);
                }}
              >
                Bloquer
              </MenuItem>
            )
          }
        </OverflowMenu>
      )}

      <div role="status" aria-live="polite" className="sr-only">
        {notice}
      </div>
      {error && (
        <div role="alert" style={{ width: '100%', textAlign: 'right', fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>
          {error}
        </div>
      )}

      {inviteOpen && <InviteModal recipient={recipient} onClose={() => setInviteOpen(false)} />}
      {blockOpen && (
        <BlockConfirmModal
          user={{ userId: profile.userId, name: profile.displayName }}
          onClose={() => setBlockOpen(false)}
          onBlocked={() => {
            setBlockOpen(false);
            setHasBlocked(true);
            setNotice('Compte bloqué.');
          }}
        />
      )}
    </div>
  );
}
