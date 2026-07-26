'use client';

// CS-10 — "/projet/[slug]/groupe": the "Gérer le groupe" surface. Replica of the prototype's
// GROUPE & PERMISSIONS screen (.dc.html 2275–2326): back link + display title + subtitle, the members
// card, the dashed merge note, then the revenue-split card. Members card and split card stay separate
// components so CS-11 ("Droits & licence") can add a third card below without rework.
// The page wrapper paints NO background — the body halftone paper shows through.
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import type {
  ApiError,
  GroupMemberDto,
  GroupMembersResponse,
  GroupPermission,
  GroupRole,
} from '@encre-et-plume/shared';
import { useSession } from '../../lib/session';
import { getGroupMembers, revokeGroupMember, updateGroupMember, updateRevenueSplit } from '../../lib/api';
import ConfirmDialog from './ConfirmDialog';
import GroupMembersCard from './GroupMembersCard';
import RevenueSplitCard from './RevenueSplitCard';
import InviteModal from '../collab/InviteModal';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; data: GroupMembersResponse }
  | { kind: 'error'; message: string };

const shell: React.CSSProperties = { maxWidth: 1000, margin: '0 auto', padding: '28px 20px 80px' };

export default function GroupePermissionsClient() {
  const params = useParams();
  const slug = Array.isArray(params.slug) ? params.slug[0] : (params.slug as string);
  const router = useRouter();
  const { account, loading: sessionLoading } = useSession();

  const [state, setState] = useState<State>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [busyMemberId, setBusyMemberId] = useState<string | null>(null);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [splitError, setSplitError] = useState<string | null>(null);
  const [savingSplit, setSavingSplit] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState<GroupMemberDto | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  useEffect(() => {
    if (sessionLoading) return;
    if (!account) {
      router.replace(`/connexion?next=/projet/${slug}/groupe`);
      return;
    }
    let alive = true;
    setState({ kind: 'loading' });
    getGroupMembers(slug)
      .then((data) => alive && setState({ kind: 'ready', data }))
      .catch((err: ApiError) =>
        alive && setState({ kind: 'error', message: err?.message ?? 'Groupe indisponible' }),
      );
    return () => {
      alive = false;
    };
  }, [slug, account, sessionLoading, router, reloadKey]);

  /** Run a mutation, swap in the refreshed group, or surface the server's French message. */
  const mutate = useCallback(
    async (memberId: string | null, run: () => Promise<GroupMembersResponse>, setError: (m: string | null) => void) => {
      setError(null);
      if (memberId) setBusyMemberId(memberId);
      try {
        const data = await run();
        setState({ kind: 'ready', data });
      } catch (err) {
        setError((err as ApiError)?.message ?? 'Une erreur est survenue. Veuillez réessayer.');
      } finally {
        if (memberId) setBusyMemberId(null);
      }
    },
    [],
  );

  const onChangeRole = (m: GroupMemberDto, groupRole: GroupRole) => {
    if (groupRole === m.groupRole) return;
    void mutate(m.id, () => updateGroupMember(m.id, { groupRole }), setMemberError);
  };

  const onTogglePermission = (m: GroupMemberDto, perm: GroupPermission) => {
    const permissions = m.permissions.includes(perm)
      ? m.permissions.filter((p) => p !== perm)
      : [...m.permissions, perm];
    void mutate(m.id, () => updateGroupMember(m.id, { permissions }), setMemberError);
  };

  const onConfirmRevoke = () => {
    const m = confirmRevoke;
    setConfirmRevoke(null);
    if (m) void mutate(m.id, () => revokeGroupMember(m.id), setMemberError);
  };

  const onSaveSplit = (shares: { memberId: string; pct: number }[]) => {
    setSavingSplit(true);
    void mutate(null, () => updateRevenueSplit(slug, { shares }), setSplitError).finally(() => setSavingSplit(false));
  };

  if (sessionLoading || !account || state.kind === 'loading') {
    return (
      <div role="status" aria-label="Chargement…" className="ep-skeleton-delayed" style={shell}>
        <div aria-hidden="true" style={{ height: 56, background: 'var(--tone)', opacity: 0.4, borderRadius: 10, marginBottom: 16 }} />
        <div aria-hidden="true" style={{ height: 240, background: 'var(--tone)', opacity: 0.3, borderRadius: 12, marginBottom: 16 }} />
        <div aria-hidden="true" style={{ height: 200, background: 'var(--tone)', opacity: 0.3, borderRadius: 12 }} />
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div style={{ maxWidth: 620, margin: '48px auto', padding: '0 20px' }}>
        <div
          style={{
            border: '3px solid var(--ink)',
            borderRadius: 10,
            boxShadow: '6px 6px 0 var(--shadow)',
            background: 'var(--card)',
            padding: '28px 24px',
          }}
        >
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, textTransform: 'uppercase', marginBottom: 10 }}>
            Groupe indisponible
          </div>
          <p style={{ fontSize: 14, color: 'var(--ink2)', marginBottom: 16 }}>{state.message}</p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="ep-btn-primary"
              onClick={() => setReloadKey((k) => k + 1)}
              style={{ fontSize: 13, fontWeight: 700, borderRadius: 6, padding: '8px 16px', minHeight: 44 }}
            >
              Réessayer
            </button>
            <Link href={`/projet/${slug}`} style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', alignSelf: 'center' }}>
              ‹ Projet
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const group = state.data;

  return (
    <section style={shell} aria-labelledby="groupe-title">
      <div style={{ display: 'flex', alignItems: 'center', gap: 13, marginBottom: 6, flexWrap: 'wrap' }}>
        <Link href={`/projet/${slug}`} className="ep-group-back" style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink2)' }}>
          ‹ Projet
        </Link>
        <h1 id="groupe-title" style={{ fontSize: 'clamp(26px, 6vw, 36px)', textTransform: 'uppercase', margin: 0 }}>Groupe &amp; permissions</h1>
      </div>
      <div style={{ fontSize: 15, color: 'var(--ink2)', fontWeight: 500, marginBottom: 22 }}>
        Gérez les membres du projet, leur statut, la fusion (merge) des versions et le partage des revenus.
      </div>

      <GroupMembersCard
        group={group}
        selfAccountId={account.id}
        busyMemberId={busyMemberId}
        error={memberError}
        onChangeRole={onChangeRole}
        onTogglePermission={onTogglePermission}
        onRevoke={setConfirmRevoke}
        onInvite={() => setInviteOpen(true)}
      />

      <RevenueSplitCard
        group={group}
        selfAccountId={account.id}
        saving={savingSplit}
        error={splitError}
        onSave={onSaveSplit}
      />

      {confirmRevoke && (
        <ConfirmDialog
          title={`Révoquer ${confirmRevoke.name} ?`}
          message={`Il·elle perdra l'accès au projet. Sa part de ${confirmRevoke.sharePct} % sera transférée au·à la propriétaire.`}
          confirmLabel="Révoquer"
          cancelLabel="Annuler"
          onConfirm={onConfirmRevoke}
          onCancel={() => setConfirmRevoke(null)}
        />
      )}

      {inviteOpen && (
        <InviteModal
          defaultProjectId={group.projectId}
          // F15-R2: a co-leader manages this project without owning it, so `/projects/mine` (the
          // picker source) doesn't return it — pass the title we already have so it is selectable.
          defaultProjectTitle={group.projectTitle}
          onClose={() => {
            setInviteOpen(false);
            setReloadKey((k) => k + 1); // a sent invitation shows up as a "En attente" row
          }}
        />
      )}
    </section>
  );
}
