'use client';

// DR-12 iter2 (FE-11, D18) — multi-select "＋ Ajouter des illustrations" picker. Replaces round-1's
// one-at-a-time inline add rows. On-brand focus-trapped dialog (reuses the NewCollectionForm pattern:
// role=dialog, aria-modal, Esc/overlay close, focus returns to the trigger). Rows are the artist's
// own illustrations NOT already members (passed in already filtered). Confirm POSTs one membership
// per selected id (the round-1 endpoint) and commits the LAST returned CollectionDetail.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ApiError, CollectionDetail, GalleryIllustrationCard } from '@encre-et-plume/shared';
import { addCollectionIllustration } from '../../lib/api';
import { coverStyle } from '../../lib/cover';
import { XIcon } from '../icons';
import OnBrandCheckbox from '../form/OnBrandCheckbox';

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
  fontSize: 14, fontWeight: 700, border: '2px solid var(--ink)', borderRadius: 6, padding: '9px 18px',
  minHeight: 44, cursor: 'pointer', fontFamily: 'inherit',
};

export default function AddIllustrationsPicker({
  collectionId,
  illustrations,
  onClose,
  onCommitted,
}: {
  collectionId: string;
  illustrations: GalleryIllustrationCard[];
  onClose: () => void;
  onCommitted: (detail: CollectionDetail) => void;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const titleId = 'add-illustrations-title';

  const [selected, setSelected] = useState<string[]>([]);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Remember the trigger so focus returns to it on close.
    triggerRef.current = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
  }, []);

  function close() {
    onClose();
    triggerRef.current?.focus?.();
  }

  function toggle(id: string) {
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  // Add an illustration that isn't on the platform yet: go to the publish flow with THIS collection
  // preselected, so the newly published illustration lands as a member.
  function publishNew() {
    router.push(`/creer/illustration?collection=${encodeURIComponent(collectionId)}`);
  }

  async function confirm() {
    if (posting || selected.length === 0) return;
    setPosting(true);
    setError(null);
    try {
      let last: CollectionDetail | null = null;
      // Sequential POSTs (each returns the fresh detail — commit the last, no extra re-fetch).
      for (const id of selected) {
        last = await addCollectionIllustration(collectionId, id);
      }
      if (last) onCommitted(last);
      close();
    } catch (err) {
      setError((err as ApiError).message ?? 'Impossible d’ajouter les illustrations. Réessayez.');
      setPosting(false);
    }
  }

  return (
    <div
      onClick={close}
      style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(22,19,15,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
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
            close();
            return;
          }
          focusTrap(e, dialogRef);
        }}
        style={{ width: 480, maxWidth: '100%', maxHeight: 'calc(100dvh - 48px)', display: 'flex', flexDirection: 'column', background: 'var(--card)', border: '3px solid var(--ink)', borderRadius: 12, boxShadow: '7px 7px 0 var(--shadow)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '15px 18px', borderBottom: '3px solid var(--ink)' }}>
          <h2 id={titleId} style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 400, textTransform: 'uppercase', margin: 0, lineHeight: 1 }}>
            ＋ Ajouter des illustrations
          </h2>
          <button type="button" onClick={close} aria-label="Fermer" style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--ink2)', cursor: 'pointer', padding: 4, display: 'inline-flex' }}>
            <XIcon size={18} />
          </button>
        </div>

        {/* flex:1 + minHeight:0 make this the scroll container (else a long list overflows the dialog,
            pushing the footer off-screen and leaving lower rows unreachable — QA-found bug). */}
        <div style={{ flex: 1, minHeight: 0, padding: '14px 18px', overflowY: 'auto' }}>
          {/* Create-and-add: publish a brand-new illustration straight into this collection. */}
          <button
            type="button"
            onClick={publishNew}
            style={{ width: '100%', marginBottom: 12, fontSize: 14, fontWeight: 700, border: '2px dashed var(--ink)', borderRadius: 8, padding: '11px 12px', minHeight: 44, cursor: 'pointer', fontFamily: 'inherit', background: 'var(--card)', color: 'var(--ink)' }}
          >
            ＋ Publier une nouvelle illustration
          </button>

          {illustrations.length === 0 ? (
            <p style={{ fontSize: 14, color: 'var(--ink2)', margin: 0 }}>Aucune autre illustration à ajouter.</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {illustrations.map((m) => (
                <li key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, border: '2px solid var(--ink)', borderRadius: 8, padding: '6px 10px' }}>
                  <OnBrandCheckbox
                    checked={selected.includes(m.id)}
                    onChange={() => toggle(m.id)}
                    label={
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                        <span aria-hidden="true" style={{ width: 38, height: 38, flex: 'none', border: '2px solid var(--ink)', borderRadius: 6, overflow: 'hidden', ...coverStyle(m.id, m.thumbnail) }} />
                        <b style={{ fontSize: 14 }}>{m.title}</b>
                      </span>
                    }
                  />
                </li>
              ))}
            </ul>
          )}
          {error && <p role="alert" style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700, margin: '10px 0 0' }}>{error}</p>}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 18px', borderTop: '3px solid var(--ink)', background: 'var(--paper)' }}>
          <button type="button" onClick={close} disabled={posting} style={{ ...footerBtn, background: 'var(--card)' }}>
            Annuler
          </button>
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={selected.length === 0 || posting}
            style={{ ...footerBtn, background: 'var(--accent)', color: '#fff', boxShadow: '3px 3px 0 var(--shadow)', opacity: selected.length === 0 || posting ? 0.6 : 1 }}
          >
            {posting ? 'Ajout…' : `Ajouter (${selected.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}
