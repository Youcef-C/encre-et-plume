'use client';

// DR-12 FE-13 — shared owner edit form for the illustration ITSELF (title, category, description,
// hashtags, tools, licence, visibility) over PATCH /illustrations/:id (returns IllustrationDetail).
// On-brand focus-trapped dialog (NewCollectionForm pattern). Reused by the illustration detail page
// (FE-13) and every member card in the manage-collection view (FE-14) — one component, no duplication.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  GALLERY_CATEGORIES,
  type ApiError,
  type GalleryCategoryKey,
  type IllustrationDetail,
  type IllustrationVisibility,
  type UpdateIllustrationRequest,
} from '@encre-et-plume/shared';
import { deleteIllustration, updateIllustration } from '../../lib/api';
import { XIcon } from '../icons';
import OnBrandSelect from '../form/OnBrandSelect';
import HashtagChipsInput from '../form/HashtagChipsInput';

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
const field = { marginBottom: 14 };
const errText: React.CSSProperties = { fontSize: 13, color: 'var(--accent)', fontWeight: 700, margin: '8px 0 0' };

export default function EditIllustrationForm({
  detail,
  onSaved,
  onClose,
}: {
  detail: IllustrationDetail;
  onSaved: (updated: IllustrationDetail) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = 'edit-illustration-title';

  const [title, setTitle] = useState(detail.title);
  const [category, setCategory] = useState<GalleryCategoryKey>(detail.category);
  const [description, setDescription] = useState(detail.description ?? '');
  const [hashtags, setHashtags] = useState<string[]>(detail.hashtags);
  const [tools, setTools] = useState(detail.tools ?? '');
  const [license, setLicense] = useState(detail.license ?? '');
  const [visibility, setVisibility] = useState<IllustrationVisibility>(
    detail.publishedAt !== null ? 'public' : 'private',
  );

  const [titleError, setTitleError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false); // on-brand confirm modal (no native window.confirm)
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  async function handleSubmit() {
    if (pending) return;
    if (!title.trim()) {
      setTitleError('Un titre est requis');
      return;
    }
    setTitleError(null);
    setServerError(null);

    const body: UpdateIllustrationRequest = {
      title: title.trim(),
      category,
      description: description.trim() || null,
      hashtags,
      tools: tools.trim() || null,
      license: license.trim() || null,
      visibility,
    };

    setPending(true);
    try {
      const updated = await updateIllustration(detail.id, body);
      onSaved(updated);
    } catch (err) {
      setServerError((err as ApiError).message ?? 'Une erreur est survenue. Réessayez.');
    } finally {
      setPending(false);
    }
  }

  async function handleDelete() {
    if (pending || deleting) return;
    setDeleteError(null);
    setDeleting(true);
    try {
      await deleteIllustration(detail.id);
      router.push('/galerie'); // navigates away — the component unmounts, no need to reset state.
    } catch (err) {
      setDeleteError((err as ApiError).message ?? 'La suppression a échoué. Réessayez.');
      setDeleting(false);
    }
  }

  return (
    <>
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 80,
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
            Modifier l’illustration
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
            <label htmlFor="edit-illus-title" style={label}>
              Titre
            </label>
            <input
              id="edit-illus-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              style={inputStyle}
              aria-invalid={!!titleError}
              aria-label="Titre"
            />
            {titleError && (
              <p role="alert" style={errText}>
                {titleError}
              </p>
            )}
          </div>

          {/* Catégorie */}
          <div style={field}>
            <label htmlFor="edit-illus-category" style={label}>
              Catégorie
            </label>
            <OnBrandSelect
              id="edit-illus-category"
              value={category}
              onChange={(e) => setCategory(e.target.value as GalleryCategoryKey)}
              aria-label="Catégorie"
            >
              {GALLERY_CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </OnBrandSelect>
          </div>

          {/* Description */}
          <div style={field}>
            <label htmlFor="edit-illus-desc" style={label}>
              Description
            </label>
            <textarea
              id="edit-illus-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={1000}
              rows={3}
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>

          {/* Hashtags (F-22) */}
          <div style={field}>
            <span style={label}>Hashtags</span>
            <HashtagChipsInput value={hashtags} onChange={setHashtags} ariaLabel="Hashtags" placeholder="#encre #noir…" />
          </div>

          {/* Outils */}
          <div style={field}>
            <label htmlFor="edit-illus-tools" style={label}>
              Outils
            </label>
            <input
              id="edit-illus-tools"
              value={tools}
              onChange={(e) => setTools(e.target.value)}
              maxLength={120}
              placeholder="Encre · CSP"
              style={inputStyle}
              aria-label="Outils"
            />
          </div>

          {/* Licence */}
          <div style={field}>
            <label htmlFor="edit-illus-license" style={label}>
              Licence
            </label>
            <input
              id="edit-illus-license"
              value={license}
              onChange={(e) => setLicense(e.target.value)}
              maxLength={120}
              placeholder="© Tous droits réservés"
              style={inputStyle}
              aria-label="Licence"
            />
          </div>

          {/* Visibilité */}
          <div style={field}>
            <label htmlFor="edit-illus-visibility" style={label}>
              Visibilité
            </label>
            <OnBrandSelect
              id="edit-illus-visibility"
              value={visibility}
              onChange={(e) => setVisibility(e.target.value as IllustrationVisibility)}
              aria-label="Visibilité"
            >
              <option value="public">Publique</option>
              <option value="private">Privée</option>
            </OnBrandSelect>
          </div>

          {serverError && (
            <p role="alert" style={{ ...errText, marginTop: 0 }}>
              {serverError}
            </p>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderTop: '3px solid var(--ink)', background: 'var(--paper)', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => {
              setDeleteError(null);
              setConfirmingDelete(true);
            }}
            disabled={deleting || pending}
            style={{ ...footerBtn, background: 'var(--card)', color: 'var(--accent)', borderColor: 'var(--accent)' }}
          >
            Supprimer l’illustration
          </button>
          <div style={{ display: 'flex', gap: 10, marginLeft: 'auto' }}>
            <button type="button" onClick={onClose} style={{ ...footerBtn, background: 'var(--card)' }}>
              Annuler
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={pending || deleting}
              style={{ ...footerBtn, background: 'var(--accent)', color: '#fff', boxShadow: '3px 3px 0 var(--shadow)', opacity: pending ? 0.6 : 1 }}
            >
              {pending ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </div>
    </div>

      {/* On-brand delete-confirm MODAL (user 2026-07-09: no native window.confirm, must be a modal). */}
      {confirmingDelete && (
        <div
          onClick={() => !deleting && setConfirmingDelete(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(22,19,15,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label="Supprimer l'illustration"
            onClick={(e) => e.stopPropagation()}
            style={{ width: 400, maxWidth: '100%', background: 'var(--card)', border: '3px solid var(--ink)', borderRadius: 12, boxShadow: '7px 7px 0 var(--shadow)', padding: 20 }}
          >
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 400, textTransform: 'uppercase', margin: '0 0 8px', lineHeight: 1.1 }}>
              Supprimer l’illustration ?
            </h2>
            <p style={{ fontSize: 14, color: 'var(--ink2)', margin: '0 0 18px', lineHeight: 1.5 }}>
              Cette action est définitive : « {detail.title} » sera retirée de la Galerie et de ses collections.
            </p>
            {deleteError && (
              <p role="alert" style={errText}>
                {deleteError}
              </p>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <button type="button" onClick={() => setConfirmingDelete(false)} disabled={deleting} style={{ ...footerBtn, background: 'var(--card)' }}>
                Annuler
              </button>
              <button
                type="button"
                onClick={() => void handleDelete()}
                disabled={deleting}
                style={{ ...footerBtn, background: 'var(--accent)', color: '#fff', boxShadow: '3px 3px 0 var(--shadow)', opacity: deleting ? 0.6 : 1 }}
              >
                {deleting ? 'Suppression…' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
