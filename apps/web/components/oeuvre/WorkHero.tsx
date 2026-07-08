'use client';

// DR-3 FE-2 — Work page hero. Replica of prototype ŒUVRE lines 854-878 (back link, cover, badges,
// title, stat row, action buttons, admin moderation bar).
// DR-9 R3: ♥ "j'aime" is a real like toggle and "＋ Ma liste" is re-pointed to the real save
// toggle (plan.md R3) — both reuse the shared `useReaction` hook; ★ favoris stays a display stat
// mirroring the save toggle's live count.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { resolveGenreId, type WorkDetail, type AccountSummary, type ReactionViewerState } from '@encre-et-plume/shared';
import { EMPTY_FILTERS, filtersToQuery } from '../../lib/catalog';
import { coverStyle } from '../../lib/cover';
import { formatLikeCount } from '../../lib/home';
import { ratingLabel } from '../../lib/work';
import { isMatureContent } from '../../lib/mature';
import { usePersonalAction } from '../../lib/usePersonalAction';
import { useResumePosition } from '../../lib/useResumePosition';
import { useReaction } from '../../lib/useReaction';
import * as api from '../../lib/api';
import { CheckIcon, HeartIcon, StarIcon, PlusIcon, ShareIcon, FlagIcon, ShieldIcon, BanIcon, WarningIcon } from '../icons';
import ResumeProgress from './ResumeProgress';
import InviteModal, { type InviteRecipient } from '../collab/InviteModal';

// Same French labels the team sidebar uses; fall back to the raw role string.
const ROLE_LABEL: Record<string, string> = { scenariste: 'Scénariste', dessinateur: 'Dessinateur' };

const badgeStyle: React.CSSProperties = {
  background: 'var(--card)',
  border: '2px solid var(--ink)',
  borderRadius: 5,
  padding: '2px 9px',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
};

const actionBase: React.CSSProperties = {
  border: '3px solid var(--ink)',
  borderRadius: 6,
  padding: '12px 18px',
  fontSize: 15,
  fontWeight: 700,
  cursor: 'pointer',
  boxShadow: '3px 3px 0 var(--shadow)',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  fontFamily: 'inherit',
};

export default function WorkHero({ work, account }: { work: WorkDetail; account: AccountSummary | null }) {
  const { trigger, notice } = usePersonalAction(account);
  const resume = useResumePosition(work.slug, account);

  // MC-3 — "Proposer une collab" targets the work's first creator who isn't the viewer.
  // No such creator (own work / only creator) → keep the deferred stub. MC-5 adds the choice modal.
  const [inviteTarget, setInviteTarget] = useState<InviteRecipient | null>(null);
  const collabTarget = work.team.find((c) => c.id !== account?.id) ?? null;
  const handleProposer = () => {
    if (!account || !collabTarget) {
      trigger();
      return;
    }
    setInviteTarget({
      userId: collabTarget.id,
      name: collabTarget.name,
      avatarUrl: collabTarget.avatar,
      subtitle: [ROLE_LABEL[collabTarget.role] ?? collabTarget.role, collabTarget.city]
        .filter(Boolean)
        .join(' · '),
    });
  };
  // F-22: genre badge links to the Découvrir genre facet when the label resolves to a vocabulary id.
  const genreId = resolveGenreId(work.genre);

  const [reactionState, setReactionState] = useState<ReactionViewerState>({ liked: false, saved: false });
  useEffect(() => {
    if (!account) {
      setReactionState({ liked: false, saved: false });
      return;
    }
    let cancelled = false;
    api
      .getReactionState('work', [work.slug])
      .then((state) => {
        if (!cancelled) setReactionState(state[work.slug] ?? { liked: false, saved: false });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [account, work.slug]);

  const like = useReaction({
    targetType: 'work',
    targetId: work.slug,
    kind: 'like',
    account,
    initialActive: reactionState.liked,
    initialCount: work.likeCount,
  });
  const save = useReaction({
    targetType: 'work',
    targetId: work.slug,
    kind: 'save',
    account,
    initialActive: reactionState.saved,
    initialCount: work.favoriteCount,
  });

  return (
    <div>
      <Link href="/decouvrir" style={{ cursor: 'pointer', fontSize: 13, fontWeight: 700, color: 'var(--ink2)' }}>
        ‹ Catalogue
      </Link>

      <div style={{ display: 'flex', gap: 26, marginTop: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div
          aria-hidden="true"
          style={{
            width: 240,
            height: 330,
            flex: 'none',
            border: '3px solid var(--ink)',
            borderRadius: 10,
            boxShadow: '7px 7px 0 var(--shadow)',
            overflow: 'hidden',
            ...coverStyle(work.id, work.cover),
          }}
        />

        <div style={{ flex: 1, minWidth: 280 }}>
          <div style={{ display: 'flex', gap: 7, marginBottom: 10, flexWrap: 'wrap', fontSize: 11, fontWeight: 700 }}>
            {/* Series status. The prototype only draws "✓ Complet"; the "En cours" pill is an
                induced deviation so an ongoing series is legible at a glance in the hero, not only
                in the DÉTAILS box. */}
            {work.complete ? (
              <span style={badgeStyle}>
                <CheckIcon size={11} /> Complet
              </span>
            ) : (
              <span style={badgeStyle}>En cours</span>
            )}
            {genreId ? (
              <Link
                href={`/decouvrir?${filtersToQuery({ ...EMPTY_FILTERS, genre: [genreId] })}`}
                aria-label={`Filtrer par ${work.genre}`}
                className="ep-tag-chip"
                style={{ ...badgeStyle, color: 'var(--ink)', textDecoration: 'none' }}
              >
                {work.genre}
              </Link>
            ) : (
              <span style={badgeStyle}>{work.genre}</span>
            )}
            <span style={{ ...badgeStyle, background: 'var(--accent)', color: '#fff' }}>
              {work.format.toUpperCase()}
            </span>
            {isMatureContent(work.genre, work.hashtags) && (
              <span style={{ ...badgeStyle, background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                <WarningIcon size={11} /> Contenu mature
              </span>
            )}
          </div>

          <h1 style={{ fontSize: 48, textTransform: 'uppercase', margin: 0, lineHeight: 0.95 }}>{work.title}</h1>
          <div style={{ fontSize: 14, color: 'var(--ink2)', fontWeight: 500, margin: '8px 0 14px' }}>{work.meta}</div>

          <div style={{ display: 'flex', gap: 16, marginBottom: 16, fontSize: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              onClick={like.toggle}
              aria-pressed={like.active}
              aria-label={like.active ? "Retirer le j'aime" : "J'aime"}
              className="ep-like-btn"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                minHeight: 44,
                padding: '10px 16px',
                border: '3px solid var(--ink)',
                borderRadius: 8,
                boxShadow: '3px 3px 0 var(--shadow)',
                cursor: 'pointer',
                font: 'inherit',
                fontWeight: 700,
                background: like.active ? 'var(--accent)' : 'var(--card)',
                color: like.active ? '#fff' : 'var(--ink)',
              }}
            >
              <HeartIcon size={20} style={{ fill: like.active ? 'currentColor' : 'none' }} />
              <b>{formatLikeCount(like.count)}</b>
              <span style={{ fontWeight: 600 }}>j&apos;aime</span>
            </button>
            <span>
              <b>{formatLikeCount(work.readCount)}</b> <span style={{ color: 'var(--ink2)', fontSize: 12 }}>lectures</span>
            </span>
            <span aria-label={`${formatLikeCount(save.count)} favoris`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <b>{formatLikeCount(save.count)}</b>
              <span style={{ color: 'var(--ink2)', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                <StarIcon size={12} style={{ color: 'var(--accent)' }} /> favoris
              </span>
            </span>
            <span>
              <b>{ratingLabel(work.ratingAvg)}</b>{' '}
              <span style={{ color: 'var(--ink2)', fontSize: 12 }}>/5 · {work.reviewCount} avis</span>
            </span>
          </div>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Link
              href={resume ? `/lecteur/${work.slug}?chapitre=${resume.chapterNumber}&page=${resume.page}` : `/lecteur/${work.slug}`}
              aria-label={
                resume
                  ? `Reprendre la lecture : chapitre ${resume.chapterNumber}, page ${resume.page} sur ${resume.totalPages}`
                  : undefined
              }
              style={{ ...actionBase, background: 'var(--accent)', color: '#fff', textDecoration: 'none' }}
            >
              {resume ? 'Reprendre la lecture' : 'Lire'}
            </Link>
            <button
              type="button"
              onClick={save.toggle}
              aria-pressed={save.active}
              aria-label={save.active ? 'Retirer de ma liste' : 'Ajouter à ma liste'}
              style={{ ...actionBase, background: save.active ? 'var(--accent)' : 'var(--card)', color: save.active ? '#fff' : 'var(--ink)' }}
            >
              {save.active ? (
                <CheckIcon key="check" size={14} className="ep-icon-pop" />
              ) : (
                <PlusIcon key="plus" size={14} className="ep-icon-pop" />
              )}{' '}
              {save.active ? 'Dans ma liste' : 'Ma liste'}
            </button>
            <button type="button" onClick={trigger} style={{ ...actionBase, background: 'var(--card)', color: 'var(--ink)' }}>
              <StarIcon size={14} style={{ color: 'var(--accent)' }} /> Soutenir
            </button>
            <button
              type="button"
              onClick={handleProposer}
              style={{ ...actionBase, background: 'var(--ink)', color: 'var(--paper)', boxShadow: '3px 3px 0 var(--accent)' }}
            >
              Proposer une collab
            </button>
            <button type="button" onClick={trigger} style={{ ...actionBase, background: 'var(--card)', color: 'var(--ink)', padding: '12px 16px' }}>
              <ShareIcon size={14} /> Partager
            </button>
            <button type="button" onClick={trigger} style={{ ...actionBase, background: 'var(--card)', color: 'var(--ink)', padding: '12px 16px' }}>
              <FlagIcon size={14} /> Signaler
            </button>
          </div>

          {resume && (
            <ResumeProgress
              chapterNumber={resume.chapterNumber}
              workTitle={resume.workTitle}
              page={resume.page}
              totalPages={resume.totalPages}
            />
          )}

          {notice && (
            <p role="status" style={{ marginTop: 8, fontSize: 12, color: 'var(--ink2)', fontWeight: 700 }}>
              Bientôt disponible
            </p>
          )}

          {(like.error || save.error) && (
            <p role="alert" style={{ marginTop: 8, fontSize: 12, color: 'var(--accent)', fontWeight: 700 }}>
              Une erreur est survenue, réessayez.
            </p>
          )}

          {account?.role === 'admin' && (
            <div
              style={{
                marginTop: 14,
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                flexWrap: 'wrap',
                border: '3px solid var(--ink)',
                borderRadius: 10,
                padding: '10px 14px',
                background: '#16130f',
                color: '#f1ece1',
                boxShadow: '4px 4px 0 var(--accent)',
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: '.05em',
                  background: 'var(--accent)',
                  color: '#fff',
                  borderRadius: 5,
                  padding: '3px 9px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <ShieldIcon size={12} /> MODÉRATION
              </span>
              <span style={{ fontSize: 12, color: '#cabfb2', fontWeight: 500 }}>
                Visible par les admins uniquement
              </span>
              <Link
                href="/admin"
                style={{
                  marginLeft: 'auto',
                  fontSize: 12,
                  fontWeight: 700,
                  border: '2px solid #f1ece1',
                  color: '#f1ece1',
                  borderRadius: 6,
                  padding: '7px 13px',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <FlagIcon size={12} /> Révoquer l&apos;œuvre
              </Link>
              <button
                type="button"
                onClick={trigger}
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  border: '2px solid #f1ece1',
                  color: '#f1ece1',
                  background: 'transparent',
                  borderRadius: 6,
                  padding: '7px 13px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  fontFamily: 'inherit',
                }}
              >
                <BanIcon size={12} /> Bannir l&apos;auteur·rice
              </button>
              <Link
                href="/admin"
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  background: 'var(--accent)',
                  color: '#fff',
                  border: '2px solid #f1ece1',
                  borderRadius: 6,
                  padding: '7px 13px',
                  textDecoration: 'none',
                }}
              >
                ↪ Dashboard
              </Link>
            </div>
          )}
        </div>
      </div>

      {inviteTarget && (
        <InviteModal recipient={inviteTarget} onClose={() => setInviteTarget(null)} />
      )}
    </div>
  );
}
