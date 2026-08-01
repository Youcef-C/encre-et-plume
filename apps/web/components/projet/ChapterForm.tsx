'use client';

// CS-7 F2/F5 — the inline "MODIFIER LE NOM & LES CARACTÉRISTIQUES" panel (prototype lines 1371–1382),
// shared by the edit panel of an existing chapter and by the "＋ Ajouter un chapitre" card.
// TITRE (min-width 240) and N° (width 64) side by side, RÉSUMÉ full width, right-aligned
// Annuler / Enregistrer. Required-field checks are client-side; UNIQUENESS is not — the server's 409
// is the truth and is surfaced next to N°.
import { useState } from 'react';

export interface ChapterFormValues {
  title: string;
  number: number;
  resume: string;
  /** « PLANCHES PRÉVUES ». R3-2: required — the column is NOT NULL, so it cannot be cleared. */
  targetPages: number;
}

export interface ChapterFormProps {
  idPrefix: string;
  initial: { title: string; number: number | null; resume: string; targetPages: number };
  /** Throws on failure; a `{ statusCode: 409 }` rejection lands next to the N° field. */
  onSubmit: (values: ChapterFormValues) => Promise<void>;
  onCancel: () => void;
  /** Induced deviation — the prototype draws no delete affordance (CRUD completeness). */
  onDelete?: () => void;
}

function messageOf(e: unknown): string | null {
  return e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : null;
}

export default function ChapterForm({ idPrefix, initial, onSubmit, onCancel, onDelete }: ChapterFormProps) {
  const [title, setTitle] = useState(initial.title);
  const [number, setNumber] = useState(initial.number === null ? '' : String(initial.number));
  const [resume, setResume] = useState(initial.resume);
  const [targetPages, setTargetPages] = useState(String(initial.targetPages));
  const [saving, setSaving] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [numberError, setNumberError] = useState<string | null>(null);
  const [targetError, setTargetError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const titleId = `${idPrefix}-title`;
  const numberId = `${idPrefix}-number`;
  const resumeId = `${idPrefix}-resume`;
  const targetId = `${idPrefix}-target`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setTitleError(null);
    setNumberError(null);
    setTargetError(null);

    const cleanTitle = title.trim();
    const parsed = Number(number);
    let invalid = false;
    if (!cleanTitle) {
      setTitleError('Le titre est obligatoire.');
      invalid = true;
    }
    if (number.trim() === '' || !Number.isInteger(parsed) || parsed < 0) {
      setNumberError('Le numéro est obligatoire (entier positif).');
      invalid = true;
    }
    // R3-2 (reverses R2-7d's "empty clears it"): every chapter has a planned length, so the field is
    // required. The server's own 400 stays the truth.
    const parsedTarget = Number(targetPages.trim());
    if (targetPages.trim() === '' || !Number.isInteger(parsedTarget) || parsedTarget <= 0) {
      setTargetError('Indiquez un entier positif.');
      invalid = true;
    }
    if (invalid) return;

    setSaving(true);
    try {
      await onSubmit({ title: cleanTitle, number: parsed, resume, targetPages: parsedTarget });
    } catch (err) {
      const status = err && typeof err === 'object' && 'statusCode' in err ? (err as { statusCode: number }).statusCode : 0;
      // 409 = the number is taken by another chapter of this project (F5's collision warning).
      if (status === 409) setNumberError(messageOf(err) ?? 'Ce numéro est déjà utilisé.');
      else setFormError(messageOf(err) ?? 'Échec de l’enregistrement. Réessayez.');
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ padding: '13px 14px', borderTop: '2px solid var(--border)', background: 'var(--paper)' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)', marginBottom: 9 }}>
        MODIFIER LE NOM &amp; LES CARACTÉRISTIQUES
      </div>

      <div className="ep-chapter-fields">
        {/* R2-4: the 240px basis lives in CSS, not inline — in the ≤768px column layout a basis is a
            HEIGHT, and an inline one could not be reset (QA measured a ~175px dead gap). */}
        <div className="ep-chapter-title-field">
          <label htmlFor={titleId} style={fieldLabel}>
            TITRE
          </label>
          <input
            id={titleId}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            aria-invalid={titleError ? true : undefined}
            aria-describedby={titleError ? `${titleId}-err` : undefined}
            style={{ ...fieldInput, width: '100%' }}
          />
          {titleError && (
            <div id={`${titleId}-err`} role="alert" style={fieldError}>
              {titleError}
            </div>
          )}
        </div>

        <div className="ep-chapter-number">
          <label htmlFor={numberId} style={fieldLabel}>
            N°
          </label>
          <input
            id={numberId}
            type="number"
            min={0}
            step={1}
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            aria-invalid={numberError ? true : undefined}
            aria-describedby={numberError ? `${numberId}-err` : undefined}
            style={{ ...fieldInput, width: '100%' }}
          />
          {numberError && (
            <div id={`${numberId}-err`} role="alert" style={{ ...fieldError, maxWidth: 260 }}>
              {numberError}
            </div>
          )}
        </div>

        <div className="ep-chapter-target">
          <label htmlFor={targetId} style={fieldLabel}>
            PLANCHES PRÉVUES
          </label>
          <input
            id={targetId}
            type="number"
            min={1}
            step={1}
            value={targetPages}
            onChange={(e) => setTargetPages(e.target.value)}
            aria-invalid={targetError ? true : undefined}
            aria-describedby={targetError ? `${targetId}-err` : undefined}
            style={{ ...fieldInput, width: '100%' }}
          />
          {targetError && (
            <div id={`${targetId}-err`} role="alert" style={{ ...fieldError, maxWidth: 260 }}>
              {targetError}
            </div>
          )}
        </div>
      </div>

      <label htmlFor={resumeId} style={{ ...fieldLabel, margin: '12px 0 4px' }}>
        RÉSUMÉ
      </label>
      <textarea
        id={resumeId}
        value={resume}
        onChange={(e) => setResume(e.target.value)}
        maxLength={2000}
        rows={3}
        style={{ ...fieldInput, width: '100%', color: 'var(--ink2)', resize: 'vertical', boxSizing: 'border-box' }}
      />

      {formError && (
        <div role="alert" style={{ ...fieldError, marginTop: 8 }}>
          {formError}
        </div>
      )}

      <div className="ep-chapter-form-actions">
        {onDelete && (
          <button type="button" onClick={onDelete} className="ep-btn-danger-outline" style={{ ...actionBtn, marginRight: 'auto' }}>
            Supprimer le chapitre
          </button>
        )}
        <button type="button" onClick={onCancel} className="ep-btn-secondary" style={actionBtn}>
          Annuler
        </button>
        <button type="submit" disabled={saving} className="ep-btn-primary" style={{ ...actionBtn, boxShadow: '2px 2px 0 var(--shadow)' }}>
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </form>
  );
}

const fieldLabel: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--ink2)',
  marginBottom: 4,
};

const fieldInput: React.CSSProperties = {
  border: '2px solid var(--ink)',
  borderRadius: 6,
  padding: '7px 11px',
  fontSize: 13,
  fontFamily: 'inherit',
  background: 'var(--card)',
  color: 'var(--ink)',
  minHeight: 44,
  boxSizing: 'border-box',
};

const fieldError: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--danger)',
  marginTop: 4,
};

const actionBtn: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  border: '2px solid var(--ink)',
  borderRadius: 6,
  padding: '7px 15px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  minHeight: 44,
};
