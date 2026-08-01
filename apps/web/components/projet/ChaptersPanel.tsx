'use client';

// CS-7 — "Espace projet" › Chapitres tab (replaces the CS-2 placeholder). Replica of the prototype's
// data-projview="chapitres" block: a stack of chapter cards followed by the accent text trigger
// "＋ Ajouter un chapitre". Reads GET /projects/:slug/chapters; every mutation is « Écriture »-gated
// server-side — `canWrite` here is presentation only (the response's own flag wins once loaded).
import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_TARGET_PAGES, type ChapterDto } from '@encre-et-plume/shared';
import { createChapter, deleteChapter, getProjectChapters } from '../../lib/api';
import ChapterAccordionItem from './ChapterAccordionItem';
import ChapterForm, { type ChapterFormValues } from './ChapterForm';
import ConfirmDialog from './ConfirmDialog';

export interface ChaptersPanelProps {
  slug: string;
  /** From the workspace payload; refined by the list response once it lands. */
  canWrite?: boolean;
  /** Chapters and page↔chapter links drive the CS-2 Tableau chips — tell the shell to refetch. */
  onChaptersChanged?: () => void;
}

export default function ChaptersPanel({ slug, canWrite = false, onChaptersChanged }: ChaptersPanelProps) {
  const [chapters, setChapters] = useState<ChapterDto[] | null>(null);
  const [serverCanWrite, setServerCanWrite] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ChapterDto | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const writable = serverCanWrite ?? canWrite;

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    getProjectChapters(slug)
      .then((res) => {
        if (cancelled) return;
        setChapters(res.chapters);
        setServerCanWrite(res.canWrite);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => load(), [load]);

  function replaceChapter(updated: ChapterDto) {
    setChapters((list) =>
      (list ?? []).map((c) => (c.id === updated.id ? updated : c)).sort((a, b) => a.number - b.number),
    );
    onChaptersChanged?.();
  }

  async function addChapter(values: ChapterFormValues) {
    const created = await createChapter(slug, {
      title: values.title,
      number: values.number,
      resume: values.resume,
      targetPages: values.targetPages,
    });
    setChapters((list) => [...(list ?? []), created].sort((a, b) => a.number - b.number));
    setAdding(false);
    onChaptersChanged?.();
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteError(null);
    // Optimistic removal — restored below if the server refuses (e.g. 409 on a published chapter).
    setChapters((list) => (list ?? []).filter((c) => c.id !== target.id));
    setDeleteTarget(null);
    try {
      await deleteChapter(target.id);
      onChaptersChanged?.();
    } catch (e) {
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : null;
      setChapters((list) => [...(list ?? []), target].sort((a, b) => a.number - b.number));
      setDeleteError(msg ?? 'Échec de la suppression. Réessayez.');
    }
  }

  // The next free number, pre-filled in the "Ajouter" form.
  const nextNumber = (chapters ?? []).reduce((max, c) => Math.max(max, c.number), -1) + 1;

  return (
    <div style={{ padding: '16px 18px 40px', display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 1024 }}>
      {loading && !chapters ? (
        <p style={muted}>Chargement…</p>
      ) : loadError ? (
        <p style={muted}>
          Impossible de charger les chapitres.{' '}
          <button type="button" onClick={() => load()} style={linkBtn}>
            Réessayer
          </button>
        </p>
      ) : (
        <>
          {deleteError && (
            <div role="alert" style={{ fontSize: 13, fontWeight: 700, color: 'var(--danger)' }}>
              {deleteError}
            </div>
          )}

          {(chapters ?? []).length === 0 && !adding ? (
            <div style={emptyCard}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, textTransform: 'uppercase' }}>
                Aucun chapitre pour le moment
              </div>
              <p style={{ fontSize: 13, color: 'var(--ink2)', margin: '6px 0 0', fontWeight: 500 }}>
                {writable
                  ? 'Créez un premier chapitre puis rattachez-y les pages du tableau.'
                  : 'Les chapitres de ce projet n’ont pas encore été créés.'}
              </p>
            </div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {(chapters ?? []).map((c) => (
                <ChapterAccordionItem
                  key={c.id}
                  chapter={c}
                  slug={slug}
                  canWrite={writable}
                  onChanged={replaceChapter}
                  onRequestDelete={(target) => {
                    setDeleteError(null);
                    setDeleteTarget(target);
                  }}
                />
              ))}
            </ul>
          )}

          {writable &&
            (adding ? (
              <div style={newCard}>
                <div style={{ padding: '12px 14px', borderBottom: '2px solid var(--border)', background: 'var(--paper)' }}>
                  <b style={{ fontSize: 16 }}>Nouveau chapitre</b>
                </div>
                <ChapterForm
                  idPrefix="chapter-new"
                  // R3-2: the planned length is required, so the add form starts on the default rather than empty.
                  initial={{ title: '', number: nextNumber, resume: '', targetPages: DEFAULT_TARGET_PAGES }}
                  onSubmit={addChapter}
                  onCancel={() => setAdding(false)}
                />
              </div>
            ) : (
              <button type="button" onClick={() => setAdding(true)} style={addTrigger}>
                ＋ Ajouter un chapitre
              </button>
            ))}
        </>
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Supprimer le chapitre ?"
          // R2-6: a chapter that still holds cards cannot be deleted — deleting it would either
          // destroy a member's cards or orphan them, and R2-1d forbids a chapterless card. State the
          // blocker instead of offering a destroy that the server would answer with a 409.
          blocked={deleteTarget.plancheCount > 0}
          message={
            deleteTarget.plancheCount > 0
              ? `Ce chapitre contient ${deleteTarget.plancheCount} carte${deleteTarget.plancheCount > 1 ? 's' : ''} — déplacez-les ou supprimez-les d’abord.`
              : `« ${deleteTarget.title ?? `Chapitre ${deleteTarget.number}`} » sera supprimé.`
          }
          confirmLabel="Supprimer"
          onConfirm={() => void confirmDelete()}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

const muted: React.CSSProperties = { fontSize: 14, color: 'var(--ink2)', margin: 0 };

const linkBtn: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: 'var(--accent)',
  fontWeight: 700,
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 14,
  padding: 0,
};

const emptyCard: React.CSSProperties = {
  border: '3px dashed var(--ink)',
  borderRadius: 10,
  background: 'var(--card)',
  padding: '22px 18px',
};

const newCard: React.CSSProperties = {
  border: '3px solid var(--ink)',
  borderRadius: 10,
  overflow: 'hidden',
  boxShadow: '3px 3px 0 var(--shadow)',
  background: 'var(--card)',
};

// The prototype draws this as a plain accent text link; kept as a real focusable button.
const addTrigger: React.CSSProperties = {
  alignSelf: 'flex-start',
  fontSize: 13,
  fontWeight: 700,
  color: 'var(--accent)',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  fontFamily: 'inherit',
  padding: '10px 0',
  minHeight: 44,
};
