'use client';

import { useState, useEffect, useRef } from 'react';
import { useScrollLock } from '../lib/useScrollLock';
import type { ProfileResponse, ApiError, SeekingTargetRole, MediaResponse, MediaVariants, PartnerRegion, CreatorRole } from '@encre-et-plume/shared';
import { SEEKING_TARGET_ROLES, PARTNER_REGIONS, COUNTRY_CODES, CREATOR_ROLES, countryLabelFr, formatLocationFr } from '@encre-et-plume/shared';
import { BrushIcon, PenNibIcon } from './icons';

// MC-1 §9 — creator-type labels (verbatim F-2/F-17 copy) + the matching partner-card icon.
const CREATOR_ROLE_LABELS: Record<CreatorRole, string> = {
  scenariste: 'Scénariste',
  dessinateur: 'Dessinateur·rice',
};
const CreatorRoleIcon = { scenariste: PenNibIcon, dessinateur: BrushIcon };

// MC-1 (round 2) — country picker options, sorted by French name (same order as /trouver).
const COUNTRY_OPTIONS = [...COUNTRY_CODES]
  .map((code) => ({ code, label: countryLabelFr(code) }))
  .sort((a, b) => a.label.localeCompare(b.label, 'fr'));
import { getProfile, updateMyProfile, setAvatar, buildSrcSet, deleteAvatar } from '../lib/api';
import { apiErrorMessage } from '../lib/apiError';
import { useFetchState, useOverride } from '../lib/useFetchState';
import { useSession } from '../lib/session';
import ProfileTags from './ProfileTags';
import ProfileTabs from './ProfileTabs';
import ProfileActions from './ProfileActions';
import { XIcon } from './icons';
import UploadControl from './UploadControl';
import GenreSuggestInput from './GenreSuggestInput';
import GenreChip from './GenreChip';
import OnBrandCheckbox from './form/OnBrandCheckbox';
import OnBrandSelect from './form/OnBrandSelect';

// Profile edit form ergonomics pass — shared style tokens for the three
// grouped sections (fieldset reset + display-font legend, matching the
// section-heading language used elsewhere, e.g. FilterSidebar's "Filtrer").
const editFieldsetStyle: React.CSSProperties = { border: 'none', padding: 0, margin: '0 0 20px 0' };
const editLegendStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  fontFamily: 'var(--font-display)',
  fontSize: 16,
  textTransform: 'uppercase',
  letterSpacing: '0.02em',
  padding: 0,
  margin: '0 0 12px 0',
  borderBottom: '2px solid var(--border)',
  paddingBottom: 8,
};

// F-2 — Public profile page client component.
// Props receive the resolved slug from the server-component wrapper.
type Props = { slug: string };

type EditData = {
  bio: string | null;
  country: string | null;
  region: PartnerRegion | null;
  creatorRoles: CreatorRole[];
  specialty: string | null;
  seeking: {
    active: boolean;
    targetRole: SeekingTargetRole | null;
    genres: string[];
    projectLength: string | null;
  };
};

function HalftoneAvatar({ displayName }: { displayName: string }) {
  const initials = displayName
    .split(' ')
    .map((w) => w[0] ?? '')
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <span
      aria-hidden="true"
      style={{
        width: 96,
        height: 96,
        borderRadius: '50%',
        border: '3px solid var(--ink)',
        backgroundImage: 'radial-gradient(var(--ink) 1.6px, transparent 1.7px)',
        backgroundSize: '6px 6px',
        backgroundColor: 'var(--tone)',
        boxShadow: '4px 4px 0 var(--shadow)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--font-display)',
        fontSize: 28,
        color: 'var(--ink)',
        flexShrink: 0,
        marginTop: -46,
      }}
    >
      {initials || '?'}
    </span>
  );
}

/**
 * Fullscreen lightbox for viewing a profile avatar at full size.
 * Opens when the user clicks the avatar image; closeable via ✕, Escape, or backdrop click.
 */
function AvatarLightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  useScrollLock();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      prevFocus?.focus();
    };
  }, [onClose]);

  return (
    /* Backdrop — click to close */
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Photo de profil de ${alt}`}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 300,
        background: 'rgba(22,19,15,0.92)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        cursor: 'zoom-out',
      }}
    >
      {/* ✕ close button — top-right corner */}
      <button
        ref={closeRef}
        type="button"
        aria-label="Fermer"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        style={{
          position: 'absolute',
          top: 16,
          right: 16,
          background: 'var(--paper)',
          border: '2px solid var(--ink)',
          borderRadius: 6,
          width: 40,
          height: 40,
          fontSize: 18,
          fontWeight: 700,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--ink)',
          boxShadow: '2px 2px 0 var(--shadow)',
          fontFamily: 'inherit',
          flexShrink: 0,
        }}
      >
        <XIcon size={18} />
      </button>
      {/* Full-size image — object-fit:contain, no crop/distortion */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '100%',
          maxHeight: '90dvh',
          objectFit: 'contain',
          border: '3px solid var(--ink)',
          borderRadius: 8,
          boxShadow: '5px 5px 0 var(--shadow)',
          cursor: 'default',
        }}
      />
    </div>
  );
}

export default function ProfilePageClient({ slug }: Props) {
  const session = useSession();
  const { account } = session;
  // DR-14: the shared hook owns the load; a transient failure keeps the skeleton and retries, so
  // only a terminal 4xx reaches the "Profil introuvable" / "Erreur" view below.
  const feed = useFetchState(() => getProfile(slug), [slug]);
  const fetchError = feed.error as ApiError | null;
  const loading = feed.state === 'loading';
  // Local edits (avatar upload/delete, profile save) layered over the fetched profile; a refetch or
  // a slug change drops them.
  const [profile, setProfile] = useOverride<ProfileResponse | null>(feed.data);

  // Edit-mode state (F-6)
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<EditData | null>(null);
  const [saving, setSaving] = useState(false);
  // Avatar variants (F-10) — populated after a successful upload in this session
  const [avatarVariants, setAvatarVariants] = useState<MediaVariants | null>(null);
  // Whether UploadControl is currently in a busy phase (blocks save)
  const [avatarBusy, setAvatarBusy] = useState(false);
  // Fullscreen lightbox open state (avatar click)
  const [lightboxOpen, setLightboxOpen] = useState(false);
  // Delete avatar confirm/loading states
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Key to reset UploadControl internal state after avatar delete
  const [uploadKey, setUploadKey] = useState(0);
  // MC-10 (F9): block state lifted here so the "Bloqué" pill sits by the name; ProfileActions
  // owns the block/unblock actions and reports changes back via onBlockedChange.
  const [blockedOverride, setBlockedOverride] = useState<boolean | null>(null);

  const isOwner = !!account && account.slug === slug;

  const hasBlocked = blockedOverride ?? Boolean(feed.data?.viewerHasBlocked);

  if (loading) {
    return (
      <div
        role="status"
        aria-label="Chargement du profil…"
        className="ep-skeleton-delayed"
        style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 28px' }}
      >
        {/* Skeleton */}
        <div
          style={{
            background: 'var(--card)',
            border: '3px solid var(--ink)',
            borderRadius: 12,
            overflow: 'hidden',
            boxShadow: '7px 7px 0 var(--shadow)',
          }}
        >
          <div
            aria-hidden="true"
            style={{ height: 150, background: 'var(--tone)', opacity: 0.5 }}
          />
          <div style={{ padding: '60px 22px 22px' }}>
            <div
              aria-hidden="true"
              style={{ height: 32, width: '40%', background: 'var(--tone)', borderRadius: 4, opacity: 0.5, marginBottom: 12 }}
            />
            <div
              aria-hidden="true"
              style={{ height: 16, width: '60%', background: 'var(--tone)', borderRadius: 4, opacity: 0.4 }}
            />
          </div>
        </div>
      </div>
    );
  }

  if (fetchError) {
    const is404 = fetchError.statusCode === 404;
    return (
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '60px 28px', textAlign: 'center' }}>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(32px, 6vw, 56px)',
            textTransform: 'uppercase',
            marginBottom: 12,
          }}
        >
          {is404 ? 'Profil introuvable' : 'Erreur'}
        </h1>
        <p style={{ color: 'var(--ink2)', fontSize: 15 }}>
          {is404
            ? "Ce profil n'existe pas ou a été supprimé."
            : apiErrorMessage(fetchError, 'Impossible de charger ce profil.')}
        </p>
        {/* F16: this block used to offer no way to retry, unlike every sibling error block. */}
        {!is404 && (
          <button
            type="button"
            onClick={feed.retry}
            className="ep-btn-primary"
            style={{ marginTop: 16, fontSize: 13, fontWeight: 700, border: '2px solid var(--ink)', borderRadius: 6, padding: '8px 16px', cursor: 'pointer' }}
          >
            Réessayer
          </button>
        )}
      </div>
    );
  }

  if (!profile) return null;

  // MC-10 round 2 (F9, D8b) — the target has blocked the signed-in viewer: disclose it and render
  // no profile shell (the API already empties the portfolio; the page hides tabs/actions/stats too).
  if (profile.blockedByTarget) {
    return (
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '60px 28px', textAlign: 'center' }}>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(32px, 6vw, 56px)',
            textTransform: 'uppercase',
            marginBottom: 12,
          }}
        >
          Profil indisponible
        </h1>
        <p style={{ color: 'var(--ink2)', fontSize: 15 }}>Cet utilisateur vous a bloqué·e.</p>
      </div>
    );
  }

  function handleStartEdit() {
    if (!profile) return;
    setEditData({
      bio: profile.bio,
      country: profile.country,
      region: profile.region,
      creatorRoles: profile.creatorRoles,
      specialty: profile.specialty,
      seeking: {
        active: profile.seeking.active,
        targetRole: profile.seeking.targetRole,
        genres: profile.seeking.genres,
        projectLength: profile.seeking.projectLength,
      },
    });
    setIsEditing(true);
  }

  function handleCancel() {
    setIsEditing(false);
    setEditData(null);
  }

  // F-20 — seeking "Genres" chip picker: case-insensitive dedup add / remove,
  // no join/split round-trip (structural fix for the comma-separated bug).
  function addSeekingGenre(fr: string) {
    setEditData((d) => {
      if (!d) return d;
      const already = d.seeking.genres.some((g) => g.toLowerCase() === fr.toLowerCase());
      if (already) return d;
      return { ...d, seeking: { ...d.seeking, genres: [...d.seeking.genres, fr] } };
    });
  }

  function removeSeekingGenre(genre: string) {
    setEditData((d) =>
      d && { ...d, seeking: { ...d.seeking, genres: d.seeking.genres.filter((g) => g !== genre) } }
    );
  }

  async function handleAvatarUploaded(media: MediaResponse) {
    const v = media.variants as MediaVariants;
    await setAvatar(media.id);
    setAvatarVariants(v);
    setProfile((p) => (p ? { ...p, avatar: v.web } : p));
    // Refresh session so Header avatar updates too
    await session.refresh();
  }

  async function handleDeleteAvatar() {
    setDeleting(true);
    try {
      await deleteAvatar();
      setProfile((p) => (p ? { ...p, avatar: null } : p));
      setAvatarVariants(null);
      setDeleteConfirm(false);
      setUploadKey((k) => k + 1); // Reset UploadControl to idle
      await session.refresh();
    } catch {
      // ponytail: swallow; profile.avatar will re-sync on next session.refresh
    } finally {
      setDeleting(false);
    }
  }

  async function handleSave() {
    if (!editData) return;
    setSaving(true);
    try {
      // Never resubmit a targetRole the server can't accept: it's hidden when seeking is inactive,
      // and a stored legacy value (e.g. 'dessinateur' vs the current 'dessinateur·rice') would fail
      // DTO validation and 400 the WHOLE PATCH — silently dropping every field, incl. creatorRoles.
      const { targetRole } = editData.seeking;
      const safeTargetRole =
        editData.seeking.active && SEEKING_TARGET_ROLES.includes(targetRole as SeekingTargetRole)
          ? targetRole
          : null;
      const updated = await updateMyProfile({
        ...editData,
        seeking: { ...editData.seeking, targetRole: safeTargetRole },
      });
      setProfile(updated);
      setIsEditing(false);
      setEditData(null);
    } catch {
      // ponytail: simple no-op; error display can be added when UX needs it
    } finally {
      setSaving(false);
    }
  }

  return (
    <section style={{ maxWidth: 1000, margin: '0 auto', padding: '24px 28px 80px' }}>
      <div
        style={{
          background: 'var(--card)',
          border: '3px solid var(--ink)',
          borderRadius: 12,
          overflow: 'hidden',
          boxShadow: '7px 7px 0 var(--shadow)',
        }}
      >
        {/* Cover banner */}
        <div
          aria-hidden="true"
          style={{
            height: 150,
            borderBottom: '3px solid var(--ink)',
            backgroundImage:
              profile.coverImage
                ? `url(${profile.coverImage})`
                : 'radial-gradient(rgba(22,19,15,.35) 1.6px, transparent 1.7px), linear-gradient(110deg, var(--ink) 30%, var(--accent) 30%)',
            backgroundSize: profile.coverImage ? 'cover' : 'var(--dot) var(--dot), cover',
            backgroundPosition: 'center',
            backgroundColor: 'var(--accent)',
          }}
        />

        {/* Profile body */}
        <div style={{ padding: '0 22px 22px' }}>
          {/* Avatar — click to view fullscreen (only when a real image exists) */}
          {profile.avatar ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={profile.avatar}
                srcSet={avatarVariants ? buildSrcSet(avatarVariants) : undefined}
                sizes="96px"
                alt={profile.displayName}
                width={96}
                height={96}
                role="button"
                tabIndex={0}
                aria-label={`Voir la photo de profil de ${profile.displayName} en grand`}
                onClick={() => setLightboxOpen(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') setLightboxOpen(true);
                }}
                style={{
                  borderRadius: '50%',
                  border: '3px solid var(--ink)',
                  boxShadow: '4px 4px 0 var(--shadow)',
                  objectFit: 'cover',
                  display: 'block',
                  marginTop: -46,
                  cursor: 'zoom-in',
                }}
              />
              {lightboxOpen && (
                <AvatarLightbox
                  src={profile.avatar}
                  alt={profile.displayName}
                  onClose={() => setLightboxOpen(false)}
                />
              )}
            </>
          ) : (
            <HalftoneAvatar displayName={profile.displayName} />
          )}

          {/* Name row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: 16,
              marginTop: 13,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ flexShrink: 0 }}>
              <h1
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 34,
                  textTransform: 'uppercase',
                  lineHeight: 1,
                  margin: 0,
                }}
              >
                {profile.displayName}
              </h1>
              {/* F-1 : le « @ » choisi à l'inscription EST le slug de profil (@yuki-moreau →
                  /yuki-moreau). Il était utilisé comme URL mais jamais affiché, si bien qu'on le
                  choisissait sans jamais le revoir. Il est désormais montré ici — c'est ce qui
                  permet de l'apprendre, donc de s'en servir pour retrouver quelqu'un (la recherche
                  l'interroge depuis le 2026-08-02), et de distinguer deux personnes qui portent le
                  même nom d'affichage. Non modifiable : c'est une URL publique. */}
              <p
                style={{ fontSize: 14, color: 'var(--ink2)', fontWeight: 700, marginTop: 2 }}
                data-profile-handle
              >
                <span aria-hidden="true">@</span>
                <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)' }}>
                  Nom d’utilisateur :{' '}
                </span>
                {profile.slug}
              </p>
              {profile.roleLine && (
                <p style={{ fontSize: 14, color: 'var(--ink2)', fontWeight: 500, marginTop: 3 }}>
                  {profile.roleLine}
                </p>
              )}
              {/* MC-10 (F9): "Bloqué" pill next to the name (only for a signed-in visitor who
                  has blocked this profile) — kept out of the action row so it doesn't crowd it. */}
              {!!account && account.id !== profile.userId && hasBlocked && (
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    marginTop: 6,
                    fontSize: 11,
                    fontWeight: 700,
                    border: '2px solid var(--accent)',
                    color: 'var(--accent)',
                    borderRadius: 5,
                    padding: '3px 9px',
                  }}
                >
                  Bloqué
                </span>
              )}
              {formatLocationFr(profile.country, profile.region) && (
                <p style={{ fontSize: 14, color: 'var(--ink2)', fontWeight: 500, marginTop: 3 }}>
                  {formatLocationFr(profile.country, profile.region)}
                </p>
              )}
              {profile.creatorRoles.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                  {profile.creatorRoles.map((r) => {
                    const Icon = CreatorRoleIcon[r];
                    return (
                      <span
                        key={r}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          background: 'var(--paper)',
                          border: '2px solid var(--ink)',
                          borderRadius: 5,
                          padding: '3px 9px',
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        <Icon size={13} />
                        {CREATOR_ROLE_LABELS[r]}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            <div style={{ flex: 1 }} />

            {/* Owner: edit toggle (while editing, Enregistrer/Annuler are anchored at the end
                of the form below instead) / Visitor: action buttons */}
            {isOwner ? (
              !isEditing && (
                <button
                  type="button"
                  onClick={handleStartEdit}
                  className="ep-btn-dark"
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    border: '2px solid var(--ink)',
                    borderRadius: 6,
                    padding: '7px 14px',
                    cursor: 'pointer',
                    boxShadow: '2px 2px 0 var(--accent)',
                    fontFamily: 'inherit',
                  }}
                >
                  &#9998; Modifier le profil
                </button>
              )
            ) : (
              <ProfileActions
                profile={profile}
                account={account}
                hasBlocked={hasBlocked}
                onBlockedChange={setBlockedOverride}
              />
            )}
          </div>

          {/* Seeking banner */}
          {profile.seeking.active && profile.seeking.text && (
            <div
              style={{
                marginTop: 14,
                border: '2px solid var(--accent)',
                borderRadius: 8,
                padding: '10px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                background: 'var(--card)',
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 9,
                  height: 9,
                  borderRadius: '50%',
                  background: 'var(--accent)',
                  display: 'block',
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 14, fontWeight: 500 }}>{profile.seeking.text}</span>
            </div>
          )}

          {/* Edit form (F-6 + F-10) — owner only, when isEditing.
              Grouped into three titled sections (fieldset + display-font legend) for
              ergonomics; Enregistrer/Annuler are anchored at the end, after the last
              section, instead of floating next to the name row. */}
          {isOwner && isEditing && editData && (
            <div
              style={{
                marginTop: 14,
                border: '2px solid var(--ink)',
                borderRadius: 8,
                padding: '18px 18px 4px',
                background: 'var(--paper)',
              }}
            >
              {/* Photo de profil — titled via UploadControl's own bold label (no
                  duplicate visible heading); aria-label keeps the fieldset grouping
                  named for assistive tech. */}
              <fieldset aria-label="Photo de profil" style={editFieldsetStyle}>
                <UploadControl
                  key={uploadKey}
                  kind="avatar"
                  label="Photo de profil"
                  currentUrl={profile.avatar}
                  onUploaded={(media) => void handleAvatarUploaded(media)}
                  onBusyChange={setAvatarBusy}
                />

                {/* Delete avatar — only when currently has one */}
                {profile.avatar && !deleteConfirm && (
                  <button
                    type="button"
                    onClick={() => setDeleteConfirm(true)}
                    className="ep-btn-secondary"
                    style={{
                      fontSize: 13,
                      padding: '6px 14px',
                      marginTop: 10,
                      color: 'var(--accent)',
                      borderColor: 'var(--accent)',
                    }}
                  >
                    Supprimer la photo
                  </button>
                )}

                {/* Inline confirm step for delete */}
                {deleteConfirm && (
                  <div
                    style={{
                      marginTop: 10,
                      padding: '10px 12px',
                      border: '2px solid var(--accent)',
                      borderRadius: 6,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      flexWrap: 'wrap',
                      background: 'var(--card)',
                    }}
                  >
                    <span style={{ fontSize: 13, flex: 1 }}>
                      Supprimer la photo de profil ?
                    </span>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => setDeleteConfirm(false)}
                        disabled={deleting}
                        className="ep-btn-secondary"
                        style={{ fontSize: 13, padding: '5px 12px' }}
                      >
                        Non
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDeleteAvatar()}
                        disabled={deleting}
                        className="ep-btn-primary"
                        style={{
                          fontSize: 13,
                          padding: '5px 14px',
                          background: 'var(--accent)',
                          borderColor: 'var(--accent)',
                        }}
                      >
                        {deleting ? 'Suppression…' : 'Oui, supprimer'}
                      </button>
                    </div>
                  </div>
                )}
              </fieldset>

              {/* Informations — spécialité + ville share a row on wider screens
                  (.ep-form-row-2 collapses to one column below 640px). */}
              <fieldset style={editFieldsetStyle}>
                <legend style={editLegendStyle}>Informations</legend>

                {/* MC-1 §9 — self-declared creator type(s); prominent toggle buttons, above the rest.
                    Both selectable, empty allowed. */}
                <fieldset style={{ border: 'none', padding: 0, margin: '0 0 14px' }}>
                  <legend className="ep-label" style={{ padding: 0, marginBottom: 8 }}>
                    Type de création
                  </legend>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9 }}>
                    {CREATOR_ROLES.map((r) => {
                      const on = editData.creatorRoles.includes(r);
                      const Icon = CreatorRoleIcon[r];
                      return (
                        <button
                          key={r}
                          type="button"
                          aria-pressed={on}
                          onClick={() =>
                            setEditData((d) =>
                              d && {
                                ...d,
                                creatorRoles: d.creatorRoles.includes(r)
                                  ? d.creatorRoles.filter((x) => x !== r)
                                  : [...d.creatorRoles, r],
                              },
                            )
                          }
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 7,
                            minHeight: 44,
                            padding: '8px 16px',
                            fontSize: 14,
                            fontWeight: 700,
                            fontFamily: 'inherit',
                            border: '2px solid var(--ink)',
                            borderRadius: 6,
                            cursor: 'pointer',
                            boxShadow: on ? '3px 3px 0 var(--shadow)' : 'none',
                            background: on ? 'var(--accent)' : 'var(--card)',
                            color: on ? '#fff' : 'var(--ink)',
                          }}
                        >
                          <Icon size={15} />
                          {CREATOR_ROLE_LABELS[r]}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>

                <div className="ep-form-row-2" style={{ marginBottom: 12 }}>
                  <div>
                    <label className="ep-label" htmlFor="edit-specialty">
                      Spécialité
                    </label>
                    <input
                      id="edit-specialty"
                      className="ep-input"
                      value={editData.specialty ?? ''}
                      onChange={(e) =>
                        setEditData((d) => d && { ...d, specialty: e.target.value || null })
                      }
                      placeholder="Ex. encre & screentone"
                    />
                  </div>
                  <div>
                    <label className="ep-label" htmlFor="edit-country">
                      Pays
                    </label>
                    {/* Switching away from France nulls the FR-only région (server enforces too, B9). */}
                    <OnBrandSelect
                      id="edit-country"
                      searchable
                      searchPlaceholder="Rechercher un pays"
                      // Match the ep-input height (Spécialité) so the row lines up.
                      style={{ padding: '10px 14px', fontSize: 15 }}
                      value={editData.country ?? ''}
                      onChange={(e) => {
                        const country = e.target.value || null;
                        setEditData((d) =>
                          d && { ...d, country, region: country === 'FR' ? d.region : null },
                        );
                      }}
                    >
                      <option value="">—</option>
                      {COUNTRY_OPTIONS.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.label}
                        </option>
                      ))}
                    </OnBrandSelect>
                  </div>
                </div>

                {editData.country === 'FR' && (
                  <div style={{ marginBottom: 12 }}>
                    <label className="ep-label" htmlFor="edit-region">
                      Région
                    </label>
                    <OnBrandSelect
                      id="edit-region"
                      searchable
                      searchPlaceholder="Rechercher une région"
                      style={{ padding: '10px 14px', fontSize: 15 }}
                      value={editData.region ?? ''}
                      onChange={(e) =>
                        setEditData((d) => d && { ...d, region: (e.target.value as PartnerRegion) || null })
                      }
                    >
                      <option value="">—</option>
                      {PARTNER_REGIONS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </OnBrandSelect>
                  </div>
                )}

                <div>
                  <label className="ep-label" htmlFor="edit-bio">
                    Biographie
                  </label>
                  <textarea
                    id="edit-bio"
                    className="ep-input"
                    rows={3}
                    value={editData.bio ?? ''}
                    onChange={(e) =>
                      setEditData((d) => d && { ...d, bio: e.target.value || null })
                    }
                    placeholder="Présentez-vous en quelques mots…"
                  />
                </div>
              </fieldset>

              {/* Recherche de partenaire — on-brand checkbox toggle (real input
                  visually hidden for a11y, custom box + CheckIcon show state), then
                  (if active) role select, genres picker, longueur — in that order. */}
              <fieldset style={editFieldsetStyle}>
                <legend style={editLegendStyle}>Recherche de partenaire</legend>

                <div style={{ marginBottom: editData.seeking.active ? 14 : 0 }}>
                  <OnBrandCheckbox
                    label="Recherche active"
                    checked={editData.seeking.active}
                    onChange={(e) =>
                      setEditData((d) =>
                        d && { ...d, seeking: { ...d.seeking, active: e.target.checked } }
                      )
                    }
                    style={{ fontWeight: 700 }}
                  />
                </div>

                {editData.seeking.active && (
                  <div style={{ paddingLeft: 8, borderLeft: '2px solid var(--tone)' }}>
                    <div style={{ marginBottom: 12 }}>
                      <label className="ep-label" htmlFor="edit-target-role">
                        Recherche un·e
                      </label>
                      <OnBrandSelect
                        id="edit-target-role"
                        value={editData.seeking.targetRole ?? ''}
                        onChange={(e) =>
                          setEditData((d) =>
                            d && {
                              ...d,
                              seeking: {
                                ...d.seeking,
                                targetRole: (e.target.value as SeekingTargetRole) || null,
                              },
                            }
                          )
                        }
                      >
                        <option value="">-- Choisir --</option>
                        {SEEKING_TARGET_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </OnBrandSelect>
                    </div>
                    <div style={{ marginBottom: 12 }}>
                      <label className="ep-label">Genres</label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                        {editData.seeking.genres.map((g) => (
                          <GenreChip key={g} label={g} onRemove={() => removeSeekingGenre(g)} />
                        ))}
                        <GenreSuggestInput
                          ariaLabel="Ajouter un genre"
                          placeholder="Genre…"
                          onCancel={() => {}}
                          onAdd={(fr) => addSeekingGenre(fr)}
                          onRemoveLast={() => {
                            const gs = editData.seeking.genres;
                            if (gs.length > 0) removeSeekingGenre(gs[gs.length - 1]);
                          }}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="ep-label" htmlFor="edit-project-length">
                        Longueur de projet
                      </label>
                      <input
                        id="edit-project-length"
                        className="ep-input"
                        value={editData.seeking.projectLength ?? ''}
                        onChange={(e) =>
                          setEditData((d) =>
                            d && {
                              ...d,
                              seeking: {
                                ...d.seeking,
                                projectLength: e.target.value || null,
                              },
                            }
                          )
                        }
                        placeholder="Ex. projet long"
                      />
                    </div>
                  </div>
                )}
              </fieldset>

              {/* Actions — anchored at the end of the form, not next to the name row */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 8,
                  borderTop: '2px solid var(--border)',
                  padding: '16px 0',
                }}
              >
                <button
                  type="button"
                  onClick={handleCancel}
                  className="ep-btn-secondary"
                  style={{ fontSize: 13, padding: '7px 16px' }}
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving || avatarBusy}
                  aria-busy={avatarBusy}
                  className="ep-btn-primary"
                  style={{ fontSize: 13, padding: '7px 18px' }}
                >
                  {saving
                    ? 'Enregistrement…'
                    : avatarBusy
                      ? 'Optimisation en cours…'
                      : 'Enregistrer'}
                </button>
              </div>
            </div>
          )}

          {/* Stats row */}
          <div
            style={{
              display: 'flex',
              gap: 28,
              marginTop: 16,
              fontSize: 15,
              flexWrap: 'wrap',
            }}
          >
            {[
              { count: profile.counters.followers, label: 'abonnés' },
              { count: profile.counters.likes, label: "J'aime" },
              { count: profile.counters.works, label: 'œuvres' },
              { count: profile.counters.supporters, label: 'soutiens' },
            ].map(({ count, label }) => (
              <span key={label}>
                <b>{count.toLocaleString('fr-FR')}</b>{' '}
                <span style={{ color: 'var(--ink2)', fontSize: 13 }}>{label}</span>
              </span>
            ))}
          </div>

          {/* Tags section (Genres & affinités) */}
          <div style={{ marginTop: 16 }}>
            <div
              style={{
                fontWeight: 700,
                fontSize: 13,
                marginBottom: 8,
              }}
            >
              {'Genres & affinités'}
            </div>
            <ProfileTags tags={profile.tags} isOwner={isOwner} />
          </div>

          {/* Profile tabs */}
          <ProfileTabs slug={slug} bio={profile.bio} />
        </div>
      </div>
    </section>
  );
}
