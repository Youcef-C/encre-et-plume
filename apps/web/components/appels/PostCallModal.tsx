'use client';

// MC-4 — "Poster un appel" modal. On-brand dialog (InviteModal pattern: role=dialog, focus trap,
// Esc/overlay close). Fields per story + ⚑4 description: direction toggle, titre, description,
// genres (GenreSuggestInput + GenreChip — never free text), format toggle, ampleur, sample upload
// (F-10 UploadControl), and a native date input for the deadline (the OnBrand rule bans native
// checkboxes/selects, not date inputs). Client-validates then POST /calls; on 201 prepends the card.
import { useEffect, useRef, useState } from 'react';
import {
  CALL_FORMATS,
  CALL_FORMAT_LABELS,
  resolveGenreId,
  type CallDirection,
  type CallFormat,
  type CallCard,
  type CreateCallRequest,
  type ApiError,
  type MediaResponse,
} from '@encre-et-plume/shared';
import { createCall } from '../../lib/api';
import { XIcon } from '../icons';
import GenreChip from '../GenreChip';
import GenreSuggestInput from '../GenreSuggestInput';
import UploadControl from '../UploadControl';

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

// Direction chips — the "Je cherche" that a poster fills. Maps to the API's CallDirection:
// seeking a dessinateur ⇒ writerSeeksIllustrator; seeking a scénariste ⇒ illustratorSeeksWriter.
const DIRECTION_OPTIONS: { value: CallDirection; label: string }[] = [
  { value: 'writerSeeksIllustrator', label: 'Un·e dessinateur·rice' },
  { value: 'illustratorSeeksWriter', label: 'Un·e scénariste' },
];

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

const chipBase: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  border: '2px solid var(--ink)',
  borderRadius: 5,
  padding: '8px 13px',
  minHeight: 44,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

function chipStyle(active: boolean): React.CSSProperties {
  return active
    ? { ...chipBase, background: 'var(--accent)', color: '#fff' }
    : { ...chipBase, background: 'var(--card)', color: 'var(--ink)' };
}

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

const field = { marginBottom: 14 };

// Tomorrow (YYYY-MM-DD) for the date input min and the future-date rule.
function tomorrowISO(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export default function PostCallModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (card: CallCard) => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = 'post-call-title';

  const [direction, setDirection] = useState<CallDirection | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [genres, setGenres] = useState<string[]>([]); // canonical FR labels
  const [format, setFormat] = useState<CallFormat | null>(null);
  const [scope, setScope] = useState('');
  const [sampleMediaId, setSampleMediaId] = useState<string | null>(null);
  const [deadline, setDeadline] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  function addGenre(fr: string) {
    setGenres((cur) => (cur.includes(fr) ? cur : [...cur, fr]));
  }
  function removeGenre(fr: string) {
    setGenres((cur) => cur.filter((g) => g !== fr));
  }

  function validate(): Record<string, string> {
    const next: Record<string, string> = {};
    if (!direction) next.direction = 'Choisissez qui vous cherchez.';
    if (!title.trim()) next.title = 'Le titre est requis.';
    if (!description.trim()) next.description = 'La description est requise.';
    if (genres.length === 0) next.genres = 'Ajoutez au moins un genre.';
    if (!deadline) next.deadline = 'La date de clôture est requise.';
    else if (deadline < tomorrowISO()) next.deadline = 'La date de clôture doit être dans le futur.';
    return next;
  }

  async function handleSubmit() {
    if (pending) return;
    const next = validate();
    setErrors(next);
    setServerError(null);
    if (Object.keys(next).length > 0) return;

    const genreIds = genres.map((g) => resolveGenreId(g)).filter((id): id is string => !!id);
    const body: CreateCallRequest = {
      direction: direction!,
      title: title.trim(),
      description: description.trim(),
      genres: genreIds,
      ...(format ? { format } : {}),
      ...(scope.trim() ? { scope: scope.trim() } : {}),
      ...(sampleMediaId ? { sampleMediaId } : {}),
      // Send an ISO datetime so the server's future check is unambiguous.
      deadline: new Date(`${deadline}T00:00:00`).toISOString(),
    };

    setPending(true);
    try {
      const card = await createCall(body);
      onCreated(card);
      onClose();
    } catch (err) {
      const apiErr = err as ApiError;
      setServerError(apiErr.message ?? 'Une erreur est survenue. Veuillez réessayer.');
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 70,
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
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 11,
            padding: '15px 18px',
            borderBottom: '3px solid var(--ink)',
          }}
        >
          <h2
            id={titleId}
            style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 400, textTransform: 'uppercase', margin: 0, lineHeight: 1 }}
          >
            Poster un appel
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
          {/* Direction */}
          <div style={field}>
            <span style={label} id="post-call-direction-label">
              Je cherche :
            </span>
            <div role="group" aria-labelledby="post-call-direction-label" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {DIRECTION_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  aria-pressed={direction === opt.value}
                  onClick={() => setDirection(opt.value)}
                  style={chipStyle(direction === opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {errors.direction && (
              <p role="alert" style={errText}>
                {errors.direction}
              </p>
            )}
          </div>

          {/* Titre */}
          <div style={field}>
            <label htmlFor="post-call-title-input" style={label}>
              Titre
            </label>
            <input
              id="post-call-title-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              placeholder="« Lames de Brume » — récit long"
              style={inputStyle}
              aria-invalid={!!errors.title}
            />
            {errors.title && (
              <p role="alert" style={errText}>
                {errors.title}
              </p>
            )}
          </div>

          {/* Description */}
          <div style={field}>
            <label htmlFor="post-call-desc" style={label}>
              Description
            </label>
            <textarea
              id="post-call-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={1000}
              rows={3}
              placeholder="Décrivez le projet et le·la partenaire recherché·e…"
              style={{ ...inputStyle, resize: 'vertical' }}
              aria-invalid={!!errors.description}
            />
            {errors.description && (
              <p role="alert" style={errText}>
                {errors.description}
              </p>
            )}
          </div>

          {/* Genres */}
          <div style={field}>
            <span style={label} id="post-call-genres-label">
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
            {errors.genres && (
              <p role="alert" style={errText}>
                {errors.genres}
              </p>
            )}
          </div>

          {/* Format */}
          <div style={field}>
            <span style={label} id="post-call-format-label">
              Format
            </span>
            <div role="group" aria-labelledby="post-call-format-label" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {CALL_FORMATS.map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={format === f}
                  onClick={() => setFormat((cur) => (cur === f ? null : f))}
                  style={chipStyle(format === f)}
                >
                  {CALL_FORMAT_LABELS[f]}
                </button>
              ))}
            </div>
          </div>

          {/* Ampleur */}
          <div style={field}>
            <label htmlFor="post-call-scope" style={label}>
              Ampleur
            </label>
            <input
              id="post-call-scope"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              maxLength={60}
              placeholder="~120 planches"
              style={inputStyle}
            />
          </div>

          {/* Visuel d'exemple */}
          <div style={field}>
            <UploadControl
              kind="call_sample"
              label="Visuel d'exemple"
              onUploaded={(m: MediaResponse) => setSampleMediaId(m.id)}
            />
          </div>

          {/* Date de clôture */}
          <div style={field}>
            <label htmlFor="post-call-deadline" style={label}>
              Date de clôture
            </label>
            <input
              id="post-call-deadline"
              type="date"
              value={deadline}
              min={tomorrowISO()}
              onChange={(e) => setDeadline(e.target.value)}
              style={{ ...inputStyle, width: 'auto' }}
              aria-invalid={!!errors.deadline}
            />
            {errors.deadline && (
              <p role="alert" style={errText}>
                {errors.deadline}
              </p>
            )}
          </div>

          {serverError && (
            <p role="alert" style={{ ...errText, marginTop: 0 }}>
              {serverError}
            </p>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
            padding: '14px 18px',
            borderTop: '3px solid var(--ink)',
            background: 'var(--paper)',
          }}
        >
          <button type="button" onClick={onClose} style={{ ...footerBtn, background: 'var(--card)' }}>
            Annuler
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={pending}
            style={{
              ...footerBtn,
              background: 'var(--accent)',
              color: '#fff',
              boxShadow: '3px 3px 0 var(--shadow)',
              opacity: pending ? 0.6 : 1,
            }}
          >
            {pending ? 'Publication…' : "Publier l'appel"}
          </button>
        </div>
      </div>
    </div>
  );
}

const errText: React.CSSProperties = {
  fontSize: 13,
  color: 'var(--accent)',
  fontWeight: 700,
  margin: '8px 0 0',
};
