'use client';

// DR-12 — "Gérer les collections" management modal for the illustration Collections box. Owner-only,
// opened from IllustrationCollections. On-brand focus-trapped dialog (NewCollectionForm pattern:
// role=dialog, Esc/overlay close, focus return to the trigger). Lets the artist add this illustration
// to their own collections, create a new collection to add it to, or remove it from a member
// collection. Changes are batched and only committed on "Sauvegarder"; "Annuler" discards them.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useScrollLock } from '../../lib/useScrollLock';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import type { ApiError, CollectionChip, CollectionSummary } from '@encre-et-plume/shared';
import { addCollectionIllustration, getMyCollections, removeCollectionIllustration } from '../../lib/api';
import { coverStyle } from '../../lib/cover';
import { XIcon } from '../icons';
import OnBrandCheckbox from '../form/OnBrandCheckbox';
import NewCollectionForm from '../collections/NewCollectionForm';

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
const rowBtn: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  border: '2px solid var(--ink)',
  borderRadius: 6,
  padding: '6px 12px',
  minHeight: 36,
  cursor: 'pointer',
  fontFamily: 'inherit',
  background: 'var(--card)',
  color: 'var(--ink)',
};
const sectionLabel: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '.06em',
  textTransform: 'uppercase',
  color: 'var(--ink2)',
  margin: '0 0 8px',
};
const errText: React.CSSProperties = { fontSize: 13, color: 'var(--accent)', fontWeight: 700, margin: '8px 0 0' };

// Selectable collection row: gallery-style cover thumbnail + title + count, on-brand bordered card
// with a clear accent selected state (replaces the plain checkbox list).
function pickRowStyle(selected: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    padding: 8,
    border: `2px solid ${selected ? 'var(--accent)' : 'var(--ink)'}`,
    borderRadius: 8,
    background: selected ? 'var(--accent-tint, rgba(232,38,28,.08))' : 'var(--card)',
    cursor: 'pointer',
    boxSizing: 'border-box',
  };
}

// Navigable cover + title for a collection row — a real <Link> to the collection's /oeuvre/:slug
// page, kept separate from the row's selection control (checkbox / "Retirer") so clicking the
// cover/title navigates while toggling membership never does. Navigating away closes the modal.
function CollectionLink({ id, slug, cover, title, count, struck }: { id: string; slug: string; cover: string | null; title: string; count: number; struck?: boolean }) {
  return (
    <Link
      href={`/oeuvre/${slug}`}
      className="ep-pick-link"
      style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0, textDecoration: 'none', color: 'inherit' }}
    >
      <span
        aria-hidden="true"
        className="ep-pick-cover"
        style={{ display: 'block', flexShrink: 0, width: 40, height: 53, border: '2px solid var(--ink)', borderRadius: 5, ...coverStyle(id, cover) }}
      />
      <span style={{ flex: 1, minWidth: 0 }}>
        <b style={{ display: 'block', fontSize: 14, lineHeight: 1.2, textDecoration: struck ? 'line-through' : 'none', color: struck ? 'var(--ink2)' : 'var(--ink)' }}>
          {title}
        </b>
        <span style={{ display: 'block', fontSize: 12, color: 'var(--ink2)', fontWeight: 700, marginTop: 2 }}>
          {count} illustration{count === 1 ? '' : 's'}
        </span>
      </span>
    </Link>
  );
}

export default function ManageCollectionsModal({
  illustrationId,
  currentCollections,
  onClose,
  onSaved,
}: {
  illustrationId: string;
  currentCollections: CollectionChip[];
  onClose: () => void;
  onSaved: (collections: CollectionChip[]) => void;
}) {
  useScrollLock();
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = 'manage-collections-title';

  // Membership this illustration started with — the diff baseline (never mutated).
  const originalMemberIds = useMemo(
    () => new Set(currentCollections.map((c) => c.id)),
    [currentCollections],
  );

  const [all, setAll] = useState<CollectionSummary[]>([]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(originalMemberIds));
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [retryKey, setRetryKey] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    dialogRef.current?.focus();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadState('loading');
    getMyCollections()
      .then((cols) => {
        if (cancelled) return;
        // Merge any member collection missing from the list (defensive — members are the artist's own).
        const byId = new Map(cols.map((c) => [c.id, c]));
        for (const c of currentCollections) {
          if (!byId.has(c.id)) byId.set(c.id, { ...c, count: 0 });
        }
        setAll([...byId.values()]);
        setLoadState('ready');
      })
      .catch(() => {
        if (!cancelled) setLoadState('error');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryKey]);

  function toggle(id: string, on: boolean) {
    setSelected((cur) => {
      const next = new Set(cur);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function handleCreated(created: CollectionSummary) {
    setAll((cur) => (cur.some((c) => c.id === created.id) ? cur : [...cur, created]));
    setSelected((cur) => new Set(cur).add(created.id)); // auto-add the illustration to the new collection
  }

  async function handleSave() {
    if (saving) return;
    setSaveError(null);
    const toAdd = [...selected].filter((id) => !originalMemberIds.has(id));
    const toRemove = [...originalMemberIds].filter((id) => !selected.has(id));
    setSaving(true);
    try {
      await Promise.all([
        ...toAdd.map((id) => addCollectionIllustration(id, illustrationId)),
        ...toRemove.map((id) => removeCollectionIllustration(id, illustrationId)),
      ]);
      // Resulting membership chips, in the collection list's order.
      const chips: CollectionChip[] = all
        .filter((c) => selected.has(c.id))
        .map((c) => ({ id: c.id, slug: c.slug, title: c.title, cover: c.cover }));
      onSaved(chips);
      onClose();
    } catch (err) {
      setSaveError((err as ApiError).message ?? 'Une erreur est survenue. Réessayez.');
      setSaving(false);
    }
  }

  const members = all.filter((c) => originalMemberIds.has(c.id));
  const addable = all.filter((c) => !originalMemberIds.has(c.id));

  // Portal to <body> so the overlay escapes any transformed/positioned ancestor stacking context
  // and sits above the z-index:50 navbar (z-index 100 keeps a clear margin over it).
  if (typeof document === 'undefined') return null;

  return (
    <>
      {createPortal(
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
            width: 480,
            maxWidth: '100%',
            maxHeight: 'calc(100dvh - 48px)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            background: 'var(--card)',
            border: '3px solid var(--ink)',
            borderRadius: 12,
            boxShadow: '7px 7px 0 var(--shadow)',
          }}
        >
          <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 11, padding: '15px 18px', borderBottom: '3px solid var(--ink)' }}>
            <h2 id={titleId} style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 400, textTransform: 'uppercase', margin: 0, lineHeight: 1 }}>
              Gérer les collections
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

          <div style={{ flex: '1 1 auto', overflowY: 'auto', padding: '16px 18px' }}>
            {loadState === 'loading' && (
              <p role="status" style={{ fontSize: 14, color: 'var(--ink2)', margin: 0 }}>
                Chargement de vos collections…
              </p>
            )}

            {loadState === 'error' && (
              <div role="alert">
                <p style={{ ...errText, marginTop: 0 }}>Impossible de charger vos collections.</p>
                <button type="button" onClick={() => setRetryKey((k) => k + 1)} style={{ ...rowBtn, marginTop: 10 }}>
                  Réessayer
                </button>
              </div>
            )}

            {loadState === 'ready' && (
              <>
                {/* Current-member collections — each removable via "Retirer" (undo with "Ajouter"). */}
                {members.length > 0 && (
                  <div style={{ marginBottom: 18 }}>
                    <span style={sectionLabel}>Membre de</span>
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {members.map((c) => {
                        const kept = selected.has(c.id);
                        return (
                          <li key={c.id}>
                            {/* Same cover-card display as "Ajouter à une collection", with a Retirer action.
                                Cover + title navigate to the collection page; "Retirer"/"Ajouter" only toggles. */}
                            <div className="ep-pick-row" style={pickRowStyle(kept)}>
                              <CollectionLink id={c.id} slug={c.slug} cover={c.cover} title={c.title} count={c.count} struck={!kept} />
                              <button
                                type="button"
                                onClick={() => toggle(c.id, !kept)}
                                aria-label={`${kept ? 'Retirer de' : 'Ajouter à'} « ${c.title} »`}
                                style={{ ...rowBtn, color: kept ? 'var(--accent)' : 'var(--ink)', borderColor: kept ? 'var(--accent)' : 'var(--ink)' }}
                              >
                                {kept ? 'Retirer' : 'Ajouter'}
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

                {/* Add to an existing collection — the artist's own collections not already members. */}
                <div style={{ marginBottom: 16 }}>
                  <span style={sectionLabel}>Ajouter à une collection</span>
                  {addable.length > 0 ? (
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {addable.map((c) => {
                        const on = selected.has(c.id);
                        return (
                          <li key={c.id}>
                            {/* Row is a plain container (NOT a label): the cover + title is a navigable
                                <Link>, the checkbox is a separate control — a <label> wrapping the link
                                would both navigate AND toggle. The checkbox carries its own aria-label. */}
                            <div className="ep-pick-row" style={pickRowStyle(on)}>
                              <CollectionLink id={c.id} slug={c.slug} cover={c.cover} title={c.title} count={c.count} />
                              {/* The box lives in its OWN label (not the whole row) so clicking it toggles
                                  the checkbox, while the cover/title Link beside it navigates instead. */}
                              <label style={{ display: 'inline-flex', flexShrink: 0, cursor: 'pointer' }}>
                                <OnBrandCheckbox
                                  checked={on}
                                  aria-label={c.title}
                                  onChange={(e) => toggle(c.id, e.target.checked)}
                                />
                              </label>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p style={{ fontSize: 13, color: 'var(--ink2)', margin: 0 }}>Aucune autre collection</p>
                  )}
                </div>

                <button type="button" onClick={() => setShowCreate(true)} style={{ ...rowBtn }}>
                  ＋ Nouvelle collection
                </button>

                {saveError && (
                  <p role="alert" style={errText}>
                    {saveError}
                  </p>
                )}
              </>
            )}
          </div>

          <div style={{ flex: 'none', display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 18px', borderTop: '3px solid var(--ink)', background: 'var(--paper)' }}>
            <button type="button" onClick={onClose} style={{ ...footerBtn, background: 'var(--card)' }}>
              Annuler
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || loadState !== 'ready'}
              style={{ ...footerBtn, background: 'var(--accent)', color: '#fff', boxShadow: '3px 3px 0 var(--shadow)', opacity: saving || loadState !== 'ready' ? 0.6 : 1 }}
            >
              {saving ? 'Enregistrement…' : 'Sauvegarder'}
            </button>
          </div>
        </div>
      </div>,
        document.body,
      )}

      {showCreate && (
        <NewCollectionForm onClose={() => setShowCreate(false)} onCreated={handleCreated} />
      )}
    </>
  );
}
