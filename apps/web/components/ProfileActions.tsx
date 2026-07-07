'use client';

// F-7 — Visitor action buttons. Suivre / Se connecter / Soutenir stay presentational stubs
// (PUB-4 / MC-8 / MR-1). MC-3 wires "Proposer une collab" to the shared invite modal:
// anonymous visitors are redirected to /connexion; signed-in visitors open the modal prefilled
// with this profile as recipient (the server rejects self-invites regardless).
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AccountSummary, ProfileResponse } from '@encre-et-plume/shared';
import { StarIcon } from './icons';
import InviteModal, { type InviteRecipient } from './collab/InviteModal';

export default function ProfileActions({
  profile,
  account,
}: {
  profile: ProfileResponse;
  account: AccountSummary | null;
}) {
  const router = useRouter();
  const [inviteOpen, setInviteOpen] = useState(false);

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

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
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

      {inviteOpen && <InviteModal recipient={recipient} onClose={() => setInviteOpen(false)} />}
    </div>
  );
}
