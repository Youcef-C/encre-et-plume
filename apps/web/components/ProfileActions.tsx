'use client';

// F-7 — Visitor action buttons. Suivre / Se connecter / Soutenir stay presentational stubs
// (PUB-4 / MC-8 / MR-1). MC-3 wires "Proposer une collab" to the shared invite modal:
// anonymous visitors are redirected to /connexion; signed-in visitors open the modal prefilled
// with this profile as recipient (the server rejects self-invites regardless).
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { AccountSummary, ConnectionState, ProfileResponse, ApiError } from '@encre-et-plume/shared';
import { StarIcon } from './icons';
import InviteModal, { type InviteRecipient } from './collab/InviteModal';
import OverflowMenu, { MenuItem } from './OverflowMenu';
import BlockConfirmModal from './blocks/BlockConfirmModal';
import { deleteBlock, sendConnectionRequest, withdrawConnectionRequest, removeContact } from '../lib/api';

// MC-8 (D12): a single button whose label swaps to the "undo" action on hover/focus (Twitter
// follow→unfollow pattern). Clicking always performs the undo action; the visible rest label shows
// the current state. aria-label stays the action so screen readers announce what a click does.
function HoverSwapButton({
  restLabel,
  hoverLabel,
  ariaLabel,
  onClick,
  restStyle,
}: {
  restLabel: string;
  hoverLabel: string;
  ariaLabel: string;
  onClick: () => void;
  // Optional rest-state styling to signal the current state (e.g. green for "connected"); the
  // hover/focus state always shows the accent (destructive-undo) treatment.
  restStyle?: React.CSSProperties;
}) {
  const [active, setActive] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
      className="ep-btn-secondary"
      style={{
        fontSize: 13,
        padding: '7px 14px',
        minWidth: 150,
        textAlign: 'center',
        ...(active
          ? { borderColor: 'var(--accent)', color: 'var(--accent)', background: 'var(--accent-soft)' }
          : restStyle),
      }}
    >
      {active ? hoverLabel : restLabel}
    </button>
  );
}

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

  // MC-8 (D12): the "Se connecter" CTA reflects the viewer→owner connection state, seeded from the
  // server field and updated locally after send/withdraw. Only wired for a signed-in non-owner.
  const canConnect = Boolean(account) && account?.id !== profile.userId;
  const [connState, setConnState] = useState<ConnectionState>(profile.connectionState ?? 'none');

  async function handleConnect() {
    setError(null);
    try {
      await sendConnectionRequest(profile.userId);
      setConnState('pending_out');
    } catch (e) {
      setError((e as ApiError).message);
    }
  }

  async function handleWithdraw() {
    setError(null);
    try {
      await withdrawConnectionRequest(profile.userId);
      setConnState('none');
    } catch (e) {
      setError((e as ApiError).message);
    }
  }

  async function handleDisconnect() {
    setError(null);
    try {
      await removeContact(profile.userId);
      setConnState('none');
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
      {(() => {
        const btnStyle = { fontSize: 13, padding: '7px 14px' } as const;
        // MC-10 soft-block: blocking severs the connection (server deletes the pair row for both
        // sides). Once blocked, no connection CTA at all — "Débloquer" lives in the overflow.
        if (hasBlocked) return null;
        // Anon / owner: connectionState is always 'none' server-side — plain unwired stub.
        if (!canConnect || connState === 'none') {
          return (
            <button
              type="button"
              onClick={canConnect ? handleConnect : undefined}
              className="ep-btn-secondary"
              style={btnStyle}
            >
              ＋ Se connecter
            </button>
          );
        }
        if (connState === 'pending_out') {
          // Single button: "Demande envoyée" → "Annuler la demande" on hover (click withdraws).
          return (
            <HoverSwapButton
              restLabel="Demande envoyée"
              hoverLabel="Annuler la demande"
              ariaLabel={`Annuler la demande de connexion à ${profile.displayName}`}
              onClick={handleWithdraw}
            />
          );
        }
        if (connState === 'pending_in') {
          return (
            <Link href="/contacts" className="ep-btn-secondary" style={{ ...btnStyle, textDecoration: 'none' }}>
              Répondre
            </Link>
          );
        }
        // connected — single button: "Connecté" → "Se déconnecter" on hover (click disconnects).
        return (
          <HoverSwapButton
            restLabel="✓ Connecté"
            hoverLabel="Se déconnecter"
            ariaLabel={`Se déconnecter de ${profile.displayName}`}
            onClick={handleDisconnect}
            restStyle={{ borderColor: '#1f8a5b', color: '#1f8a5b', background: 'var(--card)' }}
          />
        );
      })()}
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
            // Soft-block severs any connection server-side; reflect it locally so the CTA doesn't
            // keep showing "✓ Connecté"/"Demande envoyée" for a now-broken relation.
            setConnState('none');
            setNotice('Compte bloqué.');
          }}
        />
      )}
    </div>
  );
}
