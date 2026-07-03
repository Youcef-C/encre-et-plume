'use client';

import { useState, useEffect, useRef } from 'react';
import type { ProfileResponse, ApiError, SeekingTargetRole, MediaResponse, MediaVariants } from '@encre-et-plume/shared';
import { SEEKING_TARGET_ROLES } from '@encre-et-plume/shared';
import { getProfile, updateMyProfile, setAvatar, buildSrcSet, deleteAvatar } from '../lib/api';
import { useSession } from '../lib/session';
import ProfileTags from './ProfileTags';
import ProfileTabs from './ProfileTabs';
import ProfileActions from './ProfileActions';
import { XIcon } from './icons';
import UploadControl from './UploadControl';

// F-2 — Public profile page client component.
// Props receive the resolved slug from the server-component wrapper.
type Props = { slug: string };

type EditData = {
  bio: string | null;
  city: string | null;
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
  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<ApiError | null>(null);

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

  const isOwner = !!account && account.slug === slug;

  useEffect(() => {
    setLoading(true);
    setFetchError(null);
    getProfile(slug)
      .then((data) => { setProfile(data); })
      .catch((err: ApiError) => { setFetchError(err); })
      .finally(() => setLoading(false));
  }, [slug]);

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
            : fetchError.message}
        </p>
      </div>
    );
  }

  if (!profile) return null;

  function handleStartEdit() {
    if (!profile) return;
    setEditData({
      bio: profile.bio,
      city: profile.city,
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
      const updated = await updateMyProfile(editData);
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
              {profile.roleLine && (
                <p style={{ fontSize: 14, color: 'var(--ink2)', fontWeight: 500, marginTop: 3 }}>
                  {profile.roleLine}
                </p>
              )}
            </div>

            <div style={{ flex: 1 }} />

            {/* Owner: edit toggle / Visitor: action buttons */}
            {isOwner ? (
              !isEditing ? (
                <button
                  type="button"
                  onClick={handleStartEdit}
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    background: 'var(--ink)',
                    color: 'var(--paper)',
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
              ) : (
                <div style={{ display: 'flex', gap: 8 }}>
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
              )
            ) : (
              <ProfileActions />
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

          {/* Edit form (F-6 + F-10) — owner only, when isEditing */}
          {isOwner && isEditing && editData && (
            <div
              style={{
                marginTop: 14,
                border: '2px solid var(--ink)',
                borderRadius: 8,
                padding: '14px 16px',
                background: 'var(--paper)',
              }}
            >
              {/* Avatar upload (F-10) — key resets internal state after delete */}
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
                    marginBottom: 10,
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
                    marginBottom: 10,
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

              <div style={{ marginBottom: 12 }}>
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
              <div style={{ marginBottom: 12 }}>
                <label className="ep-label" htmlFor="edit-city">
                  Ville
                </label>
                <input
                  id="edit-city"
                  className="ep-input"
                  value={editData.city ?? ''}
                  onChange={(e) =>
                    setEditData((d) => d && { ...d, city: e.target.value || null })
                  }
                  placeholder="Ex. Lyon, FR"
                />
              </div>
              <div style={{ marginBottom: 12 }}>
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

              {/* Seeking toggle */}
              <div style={{ marginBottom: editData.seeking.active ? 10 : 0 }}>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={editData.seeking.active}
                    onChange={(e) =>
                      setEditData((d) =>
                        d && { ...d, seeking: { ...d.seeking, active: e.target.checked } }
                      )
                    }
                  />
                  Recherche active
                </label>
              </div>

              {editData.seeking.active && (
                <div style={{ marginTop: 10, paddingLeft: 8, borderLeft: '2px solid var(--tone)' }}>
                  <div style={{ marginBottom: 10 }}>
                    <label className="ep-label" htmlFor="edit-target-role">
                      Recherche un·e
                    </label>
                    <select
                      id="edit-target-role"
                      className="ep-input"
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
                    </select>
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <label className="ep-label" htmlFor="edit-genres">
                      Genres (séparés par virgule)
                    </label>
                    <input
                      id="edit-genres"
                      className="ep-input"
                      value={editData.seeking.genres.join(', ')}
                      onChange={(e) =>
                        setEditData((d) =>
                          d && {
                            ...d,
                            seeking: {
                              ...d.seeking,
                              genres: e.target.value
                                .split(',')
                                .map((g) => g.trim())
                                .filter(Boolean),
                            },
                          }
                        )
                      }
                      placeholder="Ex. Seinen, Thriller"
                    />
                  </div>
                  <div style={{ marginBottom: 10 }}>
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
