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
  CALL_MAX_SAMPLES,
  CALL_MAX_DOCUMENTS,
  CALL_MAX_SEATS_PER_ROLE,
  CREATOR_ROLES,
  GENRES,
  resolveGenreId,
  type CreatorRole,
  type SeatCounts,
  type CallFormat,
  type CallCard,
  type CallDetail,
  type CreateCallRequest,
  type UpdateCallRequest,
  type ApiError,
  type MediaResponse,
  type MediaVariants,
  type ProjectSummary,
} from '@encre-et-plume/shared';
import { createCall, updateCall, getMyProjects } from '../../lib/api';
import { isDocumentType, ROLE_LABEL } from '../../lib/calls';
import { XIcon } from '../icons';
import GenreChip from '../GenreChip';
import GenreSuggestInput from '../GenreSuggestInput';
import OnBrandSelect from '../form/OnBrandSelect';
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

// Compact − / ＋ seat stepper button.
function stepBtn(disabled: boolean): React.CSSProperties {
  return {
    width: 44,
    height: 44,
    flex: 'none',
    fontSize: 18,
    fontWeight: 700,
    lineHeight: 1,
    border: '2px solid var(--ink)',
    borderRadius: 6,
    background: disabled ? 'var(--tone)' : 'var(--card)',
    color: disabled ? 'var(--ink2)' : 'var(--ink)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit',
  };
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

// ISO → local YYYY-MM-DD for the date input (round-trips the create-mode local-midnight submit).
function isoToDateInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Genre ids → canonical FR labels for the edit-mode chip pre-fill.
function genreIdsToLabels(ids: string[]): string[] {
  return ids.map((id) => GENRES.find((g) => g.id === id)?.fr).filter((fr): fr is string => !!fr);
}

export default function PostCallModal({
  onClose,
  onCreated,
  edit,
  onUpdated,
}: {
  onClose: () => void;
  onCreated: (card: CallCard) => void;
  // Round 3 (F3-2): pre-filled EDIT mode over the same form. When absent, create mode is unchanged.
  edit?: { callId: string; initial: CallDetail };
  onUpdated?: (card: CallCard) => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = 'post-call-title';
  const isEdit = !!edit;
  const initial = edit?.initial;

  // §8: per-role seat counts (0 = not sought). The author position is derived server-side from the
  // profile, so there is no "Je suis :" picker. An optional linked project stays (req6).
  const [seats, setSeats] = useState<Record<CreatorRole, number>>({
    scenariste: initial?.seats.scenariste ?? 0,
    dessinateur: initial?.seats.dessinateur ?? 0,
  });
  const [projectId, setProjectId] = useState('');
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [title, setTitle] = useState(initial?.title ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [genres, setGenres] = useState<string[]>(initial ? genreIdsToLabels(initial.genres) : []); // canonical FR labels
  const [format, setFormat] = useState<CallFormat | null>(initial?.format ?? null);
  const [scope, setScope] = useState(initial?.scope ?? '');
  // MC-4X: several sample images (max CALL_MAX_SAMPLES) + PDF documents (max CALL_MAX_DOCUMENTS).
  const [samples, setSamples] = useState<{ id: string; thumb: string }[]>([]);
  const [documents, setDocuments] = useState<{ id: string; name: string }[]>([]);
  const [deadline, setDeadline] = useState(isoToDateInput(initial?.deadline ?? null));

  // Edit-mode seat floor: cannot drop a role below its accepted-application count (mirror of the B3-2 server rule).
  const seatFloor = (r: CreatorRole): number => (isEdit ? (initial?.acceptedByRole[r] ?? 0) : 0);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  // Load the author's own projects for the optional "lier à un projet" picker (best-effort).
  useEffect(() => {
    let cancelled = false;
    getMyProjects()
      .then((res) => !cancelled && setProjects(res.items))
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
  function setSeat(r: CreatorRole, delta: number) {
    setSeats((cur) => ({ ...cur, [r]: Math.max(seatFloor(r), Math.min(CALL_MAX_SEATS_PER_ROLE, cur[r] + delta)) }));
  }

  function validate(): Record<string, string> {
    const next: Record<string, string> = {};
    if (!CREATOR_ROLES.some((r) => seats[r] > 0)) next.seats = 'Choisissez au moins un poste recherché.';
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
    const seatsBody: SeatCounts = {};
    for (const r of CREATOR_ROLES) if (seats[r] > 0) seatsBody[r] = seats[r];
    // ISO datetime so the server's future check is unambiguous.
    const deadlineISO = new Date(`${deadline}T00:00:00`).toISOString();

    setPending(true);
    try {
      if (isEdit && edit) {
        // Round 3: field edit only — never touch samples/documents/project (D13).
        const body: UpdateCallRequest = {
          seats: seatsBody,
          title: title.trim(),
          description: description.trim(),
          genres: genreIds,
          ...(format ? { format } : {}),
          ...(scope.trim() ? { scope: scope.trim() } : {}),
          deadline: deadlineISO,
        };
        const card = await updateCall(edit.callId, body);
        onUpdated?.(card);
      } else {
        const body: CreateCallRequest = {
          seats: seatsBody,
          title: title.trim(),
          description: description.trim(),
          genres: genreIds,
          ...(format ? { format } : {}),
          ...(scope.trim() ? { scope: scope.trim() } : {}),
          ...(projectId ? { projectId } : {}),
          ...(samples.length ? { sampleMediaIds: samples.map((s) => s.id) } : {}),
          ...(documents.length ? { documentMediaIds: documents.map((d) => d.id) } : {}),
          deadline: deadlineISO,
        };
        const card = await createCall(body);
        onCreated(card);
      }
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
            {isEdit ? "Modifier l'appel" : 'Poster un appel'}
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
          {/* Postes recherchés — per-role seat count (0..5, 0 = not sought; ≥1 total to submit). */}
          <div style={field}>
            <span style={label} id="post-call-seats-label">
              Postes recherchés
            </span>
            <div role="group" aria-labelledby="post-call-seats-label" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {CREATOR_ROLES.map((r) => (
                <div
                  key={r}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, border: '2px solid var(--ink)', borderRadius: 8, padding: '6px 10px', background: 'var(--card)' }}
                >
                  <span style={{ fontSize: 14, fontWeight: 700, flex: 1 }}>{ROLE_LABEL[r]}</span>
                  <button
                    type="button"
                    onClick={() => setSeat(r, -1)}
                    disabled={seats[r] <= seatFloor(r)}
                    aria-label={`Retirer un poste ${ROLE_LABEL[r]}`}
                    style={stepBtn(seats[r] <= seatFloor(r))}
                  >
                    −
                  </button>
                  <span aria-live="polite" style={{ minWidth: 20, textAlign: 'center', fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-mono, monospace)' }}>
                    {seats[r]}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSeat(r, 1)}
                    disabled={seats[r] >= CALL_MAX_SEATS_PER_ROLE}
                    aria-label={`Ajouter un poste ${ROLE_LABEL[r]}`}
                    style={stepBtn(seats[r] >= CALL_MAX_SEATS_PER_ROLE)}
                  >
                    ＋
                  </button>
                </div>
              ))}
            </div>
            {errors.seats && (
              <p role="alert" style={errText}>
                {errors.seats}
              </p>
            )}
          </div>

          {/* Optional link to one of the author's own projects. Hidden in edit mode (D13). */}
          {!isEdit && projects.length > 0 && (
            <div style={field}>
              <label htmlFor="post-call-project" style={label}>
                Lier à un projet <span style={{ color: 'var(--ink2)', fontWeight: 500 }}>(facultatif)</span>
              </label>
              <OnBrandSelect
                id="post-call-project"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                aria-label="Lier à un projet"
              >
                <option value="">Aucun projet lié</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </OnBrandSelect>
            </div>
          )}

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

          {/* Edit mode (D13): media + linked project are not editable — the contract carries no media ids. */}
          {isEdit && (
            <p style={{ fontSize: 12, color: 'var(--ink2)', margin: '0 0 14px' }}>
              Les visuels, les documents et le projet lié ne sont pas modifiables.
            </p>
          )}

          {/* Visuels et documents — ONE combined box; images and PDF/text route by content-type,
              per-family caps (5 visuels, 3 documents) enforced via extraValidate. Create-only (D13). */}
          {!isEdit && (
          <div style={field}>
            <span style={label}>
              Visuels et documents{' '}
              <span style={{ color: 'var(--ink2)', fontWeight: 500 }}>
                ({samples.length}/{CALL_MAX_SAMPLES} visuels · {documents.length}/{CALL_MAX_DOCUMENTS} documents)
              </span>
            </span>

            {samples.length > 0 && (
              <ul style={{ listStyle: 'none', margin: '0 0 10px', padding: 0, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {samples.map((s, i) => (
                  <li key={s.id} style={{ position: 'relative', width: 48, height: 62, flex: 'none' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={s.thumb}
                      alt={`Visuel d'exemple ${i + 1}`}
                      width={48}
                      height={62}
                      style={{ width: 48, height: 62, objectFit: 'cover', border: '2px solid var(--ink)', borderRadius: 5, display: 'block' }}
                    />
                    <button
                      type="button"
                      onClick={() => setSamples((cur) => cur.filter((x) => x.id !== s.id))}
                      aria-label={`Retirer le visuel ${i + 1}`}
                      style={{
                        position: 'absolute',
                        top: -8,
                        right: -8,
                        width: 22,
                        height: 22,
                        borderRadius: '50%',
                        background: 'var(--card)',
                        border: '2px solid var(--ink)',
                        color: 'var(--ink)',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0,
                      }}
                    >
                      <XIcon size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {documents.length > 0 && (
              <ul style={{ listStyle: 'none', margin: '0 0 10px', padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {documents.map((d, i) => (
                  <li key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, border: '2px solid var(--ink)', borderRadius: 6, padding: '6px 10px', background: 'var(--card)' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      ✓ {d.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => setDocuments((cur) => cur.filter((x) => x.id !== d.id))}
                      aria-label={`Retirer le document ${i + 1}`}
                      style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--ink2)', cursor: 'pointer', padding: 2, display: 'inline-flex', flex: 'none' }}
                    >
                      <XIcon size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {samples.length >= CALL_MAX_SAMPLES && documents.length >= CALL_MAX_DOCUMENTS ? (
              <p style={{ fontSize: 12, color: 'var(--ink2)', margin: 0 }}>
                Maximum {CALL_MAX_SAMPLES} visuels et {CALL_MAX_DOCUMENTS} documents.
              </p>
            ) : (
              <UploadControl
                key={`${samples.length}-${documents.length}`}
                kind="call_sample"
                documentKind="call_document"
                label="Ajouter un fichier"
                onUploaded={(m: MediaResponse, filename?: string) => {
                  if (m.kind === 'call_document') {
                    setDocuments((cur) => [...cur, { id: m.id, name: filename ?? 'Document' }]);
                  } else {
                    setSamples((cur) => [...cur, { id: m.id, thumb: (m.variants as MediaVariants).thumb }]);
                  }
                }}
                extraValidate={(file) =>
                  isDocumentType(file.type)
                    ? documents.length >= CALL_MAX_DOCUMENTS
                      ? `Maximum ${CALL_MAX_DOCUMENTS} documents.`
                      : null
                    : samples.length >= CALL_MAX_SAMPLES
                      ? `Maximum ${CALL_MAX_SAMPLES} visuels.`
                      : null
                }
              />
            )}
          </div>
          )}

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
            {isEdit
              ? pending
                ? 'Enregistrement…'
                : 'Enregistrer'
              : pending
                ? 'Publication…'
                : "Publier l'appel"}
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
