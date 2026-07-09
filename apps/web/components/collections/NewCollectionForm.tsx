'use client';

// DR-12 FE-2 — inline "Nouvelle collection" create form. On-brand focus-trapped dialog
// (PostCallModal pattern: role=dialog, Esc/overlay close, focus return to the trigger). Reused by
// the publish form (FE-1), the illustration-detail edit panel (FE-5), and the manage view (FE-4).
// A collection is a Work — cover uses the CS-2/F-10 mechanism (UploadControl kind='cover'). Contest
// and Soutien are thin stored config (D4/D5). Euro inputs are cents on the wire.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  resolveGenreId,
  type ActiveContest,
  type ApiError,
  type CollectionSummary,
  type CreateCollectionRequest,
  type MediaResponse,
  type MediaVariants,
  type SoutienTier,
  type SoutienGoalInput,
} from '@encre-et-plume/shared';
import { createCollection, getActiveContest } from '../../lib/api';
import { XIcon } from '../icons';
import GenreChip from '../GenreChip';
import GenreSuggestInput from '../GenreSuggestInput';
import OnBrandSelect from '../form/OnBrandSelect';
import OnBrandCheckbox from '../form/OnBrandCheckbox';
import HashtagChipsInput from '../form/HashtagChipsInput';
import UploadControl from '../UploadControl';
import { COVER_FRAME_HEIGHT } from '../../lib/cover';

function focusTrap(e: React.KeyboardEvent, dialogRef: React.RefObject<HTMLDivElement | null>) {
  if (e.key !== 'Tab' || !dialogRef.current) return;
  const focusable = Array.from(
    dialogRef.current.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  );
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (e.shiftKey) {
    if (document.activeElement === first) {
      e.preventDefault();
      last.focus();
    }
  } else if (document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

const label: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--ink2)',
  letterSpacing: '.02em',
  display: 'block',
  marginBottom: 6,
};
const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '2px solid var(--ink)',
  borderRadius: 8,
  padding: '10px 12px',
  fontSize: 14,
  fontFamily: 'inherit',
  background: 'var(--card)',
  color: 'var(--ink)',
  boxSizing: 'border-box',
};
const footerBtn: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  border: '2px solid var(--ink)',
  borderRadius: 6,
  padding: '9px 18px',
  minHeight: 44,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
const addRowBtn: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  border: '2px solid var(--ink)',
  borderRadius: 6,
  padding: '7px 13px',
  minHeight: 40,
  cursor: 'pointer',
  fontFamily: 'inherit',
  background: 'var(--card)',
  color: 'var(--ink)',
};
const field = { marginBottom: 14 };
const errText: React.CSSProperties = { fontSize: 13, color: 'var(--accent)', fontWeight: 700, margin: '8px 0 0' };

/** €"5,50" | "5.5" → cents; empty/invalid → 0. */
function eurosToCents(v: string): number {
  const n = Number.parseFloat(v.replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export default function NewCollectionForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (summary: CollectionSummary) => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = 'new-collection-title';

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [genres, setGenres] = useState<string[]>([]); // canonical FR labels
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [coverMediaId, setCoverMediaId] = useState<string | null>(null);
  const [coverBusy, setCoverBusy] = useState(false);
  const [contest, setContest] = useState<ActiveContest | null>(null);
  const [contestId, setContestId] = useState('');
  const [tiers, setTiers] = useState<{ name: string; euros: string }[]>([]);
  const [allowDonations, setAllowDonations] = useState(false);
  const [goals, setGoals] = useState<{ title: string; euros: string }[]>([]);

  const [errors, setErrors] = useState<{ title?: string }>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    let cancelled = false;
    getActiveContest()
      .then((c) => !cancelled && setContest(c))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  function addGenre(fr: string) {
    setGenres((cur) => (cur.includes(fr) ? cur : [...cur, fr]));
  }
  function removeGenre(fr: string) {
    setGenres((cur) => cur.filter((g) => g !== fr));
  }

  async function handleSubmit() {
    if (pending) return;
    if (!title.trim()) {
      setErrors({ title: 'Un titre est requis' });
      return;
    }
    setErrors({});
    setServerError(null);

    const genreIds = genres.map((g) => resolveGenreId(g)).filter((id): id is string => !!id);
    const tiersBody: SoutienTier[] = tiers
      .filter((t) => t.name.trim())
      .map((t) => ({ name: t.name.trim(), priceCents: eurosToCents(t.euros) }));
    const goalsBody: SoutienGoalInput[] = goals
      .filter((g) => g.title.trim())
      .map((g) => ({ title: g.title.trim(), targetCents: eurosToCents(g.euros) }));

    const body: CreateCollectionRequest = {
      title: title.trim(),
      ...(description.trim() ? { description: description.trim() } : {}),
      ...(genreIds.length ? { genres: genreIds } : {}),
      ...(hashtags.length ? { hashtags } : {}),
      ...(coverMediaId ? { cover: { mediaId: coverMediaId } } : {}),
      ...(contestId ? { contestId } : {}),
      ...(tiersBody.length ? { tiers: tiersBody } : {}),
      ...(allowDonations ? { allowDonations: true } : {}),
      ...(goalsBody.length ? { goals: goalsBody } : {}),
    };

    setPending(true);
    try {
      const created = await createCollection(body);
      onCreated(created);
      onClose();
    } catch (err) {
      setServerError((err as ApiError).message ?? 'Une erreur est survenue. Réessayez.');
    } finally {
      setPending(false);
    }
  }

  // Portal to <body> so the overlay escapes any transformed/positioned ancestor stacking context
  // (the illustration detail page, and — when nested — ManageCollectionsModal) and sits above the
  // z-index:50 navbar. z-index 100 keeps a clear margin over it.
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(22,19,15,.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            onClose();
            return;
          }
          focusTrap(e, dialogRef);
        }}
        style={{
          width: 520,
          maxWidth: '100%',
          maxHeight: 'calc(100dvh - 48px)',
          overflowY: 'auto',
          background: 'var(--card)',
          border: '3px solid var(--ink)',
          borderRadius: 12,
          boxShadow: '7px 7px 0 var(--shadow)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '15px 18px', borderBottom: '3px solid var(--ink)' }}>
          <h2 id={titleId} style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 400, textTransform: 'uppercase', margin: 0, lineHeight: 1 }}>
            ＋ Nouvelle collection
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--ink2)', cursor: 'pointer', padding: 4, display: 'inline-flex' }}
          >
            <XIcon size={18} />
          </button>
        </div>

        <div style={{ padding: '16px 18px' }}>
          {/* Titre */}
          <div style={field}>
            <label htmlFor="new-collection-title-input" style={label}>
              Titre
            </label>
            <input
              id="new-collection-title-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              placeholder="« Carnet d’Encre »"
              style={inputStyle}
              aria-invalid={!!errors.title}
              aria-label="Titre"
            />
            {errors.title && (
              <p role="alert" style={errText}>
                {errors.title}
              </p>
            )}
          </div>

          {/* Description */}
          <div style={field}>
            <label htmlFor="new-collection-desc" style={label}>
              Description
            </label>
            <textarea
              id="new-collection-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={1000}
              rows={3}
              placeholder="Décrivez cette collection…"
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>

          {/* Genres */}
          <div style={field}>
            <span style={label} id="new-collection-genres-label">
              Genres
            </span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {genres.map((g) => (
                <GenreChip key={g} label={g} onRemove={() => removeGenre(g)} />
              ))}
              <GenreSuggestInput
                key={genres.length}
                ariaLabel="Ajouter un genre"
                placeholder="Ajouter…"
                onAdd={addGenre}
                onCancel={() => {}}
                onRemoveLast={() => setGenres((cur) => cur.slice(0, -1))}
              />
            </div>
          </div>

          {/* Hashtags (F-22) */}
          <div style={field}>
            <span style={label}>Hashtags</span>
            <HashtagChipsInput value={hashtags} onChange={setHashtags} ariaLabel="Hashtags" />
          </div>

          {/* Couverture (CS-2 / F-10) — the drop box matches the œuvre-cover frame height (FE-10). */}
          <div style={field}>
            <UploadControl
              kind="cover"
              label="Déposez la couverture"
              frameHeight={COVER_FRAME_HEIGHT}
              onBusyChange={setCoverBusy}
              onUploaded={(m: MediaResponse) => setCoverMediaId(m.id)}
            />
          </div>

          {/* Lié à un concours */}
          <div style={field}>
            <label htmlFor="new-collection-contest" style={label}>
              Lié à un concours
            </label>
            <OnBrandSelect
              id="new-collection-contest"
              value={contestId}
              onChange={(e) => setContestId(e.target.value)}
              aria-label="Lié à un concours"
            >
              <option value="">Aucun concours</option>
              {contest && (
                <option value={contest.id}>
                  {contest.category} · {contest.title}
                </option>
              )}
            </OnBrandSelect>
            {!contest && (
              <p style={{ fontSize: 12, color: 'var(--ink2)', margin: '6px 0 0' }}>Aucun concours ouvert</p>
            )}
          </div>

          {/* Soutien · optionnel */}
          <fieldset style={{ border: '2px solid var(--ink)', borderRadius: 8, padding: '12px 14px', margin: '0 0 14px' }}>
            <legend style={{ fontSize: 12, fontWeight: 700, padding: '0 6px' }}>Soutien · optionnel</legend>

            <span style={label}>Paliers d’abonnement</span>
            {tiers.map((t, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                <input
                  aria-label={`Nom du palier ${i + 1}`}
                  value={t.name}
                  onChange={(e) => setTiers((cur) => cur.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                  placeholder="Nom du palier"
                  style={{ ...inputStyle, flex: 2, minWidth: 120 }}
                />
                <input
                  aria-label={`Prix mensuel du palier ${i + 1} (€)`}
                  type="number"
                  min={0}
                  step="0.5"
                  value={t.euros}
                  onChange={(e) => setTiers((cur) => cur.map((x, j) => (j === i ? { ...x, euros: e.target.value } : x)))}
                  placeholder="€/mois"
                  style={{ ...inputStyle, flex: 1, minWidth: 90 }}
                />
                <button
                  type="button"
                  aria-label={`Retirer le palier ${i + 1}`}
                  onClick={() => setTiers((cur) => cur.filter((_, j) => j !== i))}
                  style={{ ...addRowBtn, flex: 'none' }}
                >
                  <XIcon size={13} />
                </button>
              </div>
            ))}
            <button type="button" onClick={() => setTiers((cur) => [...cur, { name: '', euros: '' }])} style={{ ...addRowBtn, marginBottom: 12 }}>
              ＋ Ajouter un palier
            </button>

            <div style={{ marginBottom: 12 }}>
              <OnBrandCheckbox
                label="Autoriser les dons uniques"
                checked={allowDonations}
                onChange={(e) => setAllowDonations(e.target.checked)}
                style={{ fontWeight: 700 }}
              />
            </div>

            <span style={label}>Objectifs de financement</span>
            {goals.map((g, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                <input
                  aria-label={`Titre de l’objectif ${i + 1}`}
                  value={g.title}
                  onChange={(e) => setGoals((cur) => cur.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                  placeholder="Objectif"
                  style={{ ...inputStyle, flex: 2, minWidth: 120 }}
                />
                <input
                  aria-label={`Cible de l’objectif ${i + 1} (€)`}
                  type="number"
                  min={0}
                  step="1"
                  value={g.euros}
                  onChange={(e) => setGoals((cur) => cur.map((x, j) => (j === i ? { ...x, euros: e.target.value } : x)))}
                  placeholder="Cible €"
                  style={{ ...inputStyle, flex: 1, minWidth: 90 }}
                />
                <button
                  type="button"
                  aria-label={`Retirer l’objectif ${i + 1}`}
                  onClick={() => setGoals((cur) => cur.filter((_, j) => j !== i))}
                  style={{ ...addRowBtn, flex: 'none' }}
                >
                  <XIcon size={13} />
                </button>
              </div>
            ))}
            <button type="button" onClick={() => setGoals((cur) => [...cur, { title: '', euros: '' }])} style={addRowBtn}>
              ＋ Ajouter un objectif
            </button>
          </fieldset>

          {serverError && (
            <p role="alert" style={{ ...errText, marginTop: 0 }}>
              {serverError}
            </p>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 18px', borderTop: '3px solid var(--ink)', background: 'var(--paper)' }}>
          <button type="button" onClick={onClose} style={{ ...footerBtn, background: 'var(--card)' }}>
            Annuler
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={pending || coverBusy}
            style={{ ...footerBtn, background: 'var(--accent)', color: '#fff', boxShadow: '3px 3px 0 var(--shadow)', opacity: pending || coverBusy ? 0.6 : 1 }}
          >
            {pending ? 'Création…' : 'Créer la collection'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
