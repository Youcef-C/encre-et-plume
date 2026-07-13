'use client';

// CS-2 card-modal extension — the card detail modal. Improves the prototype's [data-card-modal]
// "Nouvelle carte" panel (proto 2597–2619: TITRE · COLONNE · TYPE DE PAGE · FICHIERS LIÉS) into a
// full detail editor: DESCRIPTION · ÉTIQUETTES · ÉCHÉANCE · CHECKLIST · ASSIGNÉ À · COMMENTAIRES.
// Simple fields (title/description/dueDate/labels) debounce-autosave with the InfosPanel
// "Enregistré ✓" pattern; checklist/comment/assignee actions are immediate + optimistic (revert on
// error). Comments/checklist are refetch-on-open (no realtime — deferred by the story).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useScrollLock } from '../../lib/useScrollLock';
import {
  PAGE_STAGES,
  LABEL_COLORS,
  LABEL_COLOR_NAMES,
  type PageStage,
  type PageFileTag,
  type WorkspaceMember,
  type WorkspacePage,
  type PageDetailResponse,
  type PageChecklistItemDto,
  type PageCommentItem,
  type ProjectLabelItem,
  type UpdatePageRequest,
  type AssetItem,
  type AssetType,
  type PageLinkedFileRef,
} from '@encre-et-plume/shared';
import { CalendarIcon, TagIcon, EyeIcon, FileTextIcon, ImageIcon } from '../icons';
import OnBrandSelect from '../form/OnBrandSelect';
import OnBrandCheckbox from '../form/OnBrandCheckbox';
import ConfirmDialog from './ConfirmDialog';
import AssetPreviewOverlay from './AssetPreviewOverlay';
import AssetVersionsModal from './AssetVersionsModal';
import LinkAssetPicker from './LinkAssetPicker';
import { relativeTime } from '../../lib/notifications';
import {
  getPageDetail,
  listProjectAssets,
  unlinkAssetFromPage,
  updatePage,
  updatePageStage,
  deletePage,
  createProjectLabel,
  updateProjectLabel,
  deleteProjectLabel,
  addChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
  addPageComment,
  updatePageComment,
  deletePageComment,
} from '../../lib/api';

const STAGE_LABELS: Record<PageStage, string> = {
  scenario: 'Scénario',
  nemu: 'Nemu',
  corrections: 'Corrections',
  propre: 'PROPRE',
  encrage: 'Encrage',
  valide: 'VALIDÉ ✓',
};

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

// FICHIERS per-type sections (D-A): each maps to CS-3 asset type(s). `page` reads as "planche finale".
// `canonical` is the section's re-type target when an out-of-section asset is linked here (D-I).
const FICHIERS_SECTIONS: { label: string; hint?: string; types: AssetType[]; canonical: AssetType; icon: 'doc' | 'img' }[] = [
  { label: 'SCÉNARIO', types: ['scenario', 'texte'], canonical: 'scenario', icon: 'doc' },
  { label: 'DESSIN', hint: '(nemu/encrage)', types: ['dessin'], canonical: 'dessin', icon: 'img' },
  { label: 'PAGE', hint: '(planche finale)', types: ['page'], canonical: 'page', icon: 'img' },
  { label: 'RÉFÉRENCES', types: ['ref'], canonical: 'ref', icon: 'img' },
];

const toRef = (a: AssetItem): PageLinkedFileRef => ({
  assetId: a.id,
  type: a.type,
  filename: a.filename,
  version: a.currentVersion,
});

export interface CardModalProps {
  pageId: string;
  slug: string;
  members: WorkspaceMember[];
  labels: ProjectLabelItem[];
  viewerId: string | null;
  isOwner: boolean;
  readOnly?: boolean;
  onClose: () => void;
  onPageChange: (page: WorkspacePage) => void;
  onDeleted: (id: string) => void;
  /** Bubble the full palette up so the board's filter row + card bars re-render. */
  onLabelsChange: (labels: ProjectLabelItem[]) => void;
}

function withCounts(d: PageDetailResponse): PageDetailResponse {
  return {
    ...d,
    checklistTotal: d.checklist.length,
    checklistDone: d.checklist.filter((i) => i.done).length,
    commentCount: d.comments.length,
  };
}

export default function CardModal({
  pageId,
  slug,
  members,
  labels,
  viewerId,
  isOwner,
  readOnly,
  onClose,
  onPageChange,
  onDeleted,
  onLabelsChange,
}: CardModalProps) {
  const [detail, setDetail] = useState<PageDetailResponse | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState<string>('');
  const [titleError, setTitleError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [confirmDelete, setConfirmDelete] = useState(false);

  // FICHIERS block — independent load (its own skeleton/error; the rest of the modal doesn't wait).
  const [assets, setAssets] = useState<AssetItem[] | null>(null);
  const [assetsError, setAssetsError] = useState(false);
  const [previewTarget, setPreviewTarget] = useState<AssetItem | null>(null);
  const [versionsTarget, setVersionsTarget] = useState<AssetItem | null>(null);
  const [linkPicker, setLinkPicker] = useState<{ types: AssetType[]; canonical: AssetType; label: string } | null>(null);

  const pendingRef = useRef<UpdatePageRequest>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useScrollLock();
  const panelRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const previouslyFocused = useRef<Element | null>(null);

  const titleId = 'card-modal-title';

  // Load detail on open (this IS the comments/checklist refetch-on-open).
  useEffect(() => {
    let alive = true;
    getPageDetail(pageId)
      .then((d) => {
        if (!alive) return;
        setDetail(withCounts(d));
        setTitle(d.title);
        setDescription(d.description ?? '');
        setDueDate(d.dueDate ?? '');
      })
      .catch(() => {
        if (alive) setLoadError(true);
      });
    return () => {
      alive = false;
    };
  }, [pageId]);

  // FICHIERS: one fetch on open, grouped client-side by section (D-B). A card never nears the page size.
  useEffect(() => {
    let alive = true;
    setAssets(null);
    setAssetsError(false);
    listProjectAssets(slug, { pageId })
      .then((res) => {
        if (alive) setAssets(res.items);
      })
      .catch(() => {
        if (alive) setAssetsError(true);
      });
    return () => {
      alive = false;
    };
  }, [slug, pageId]);

  // Focus management: move focus in on open, return it to the opener on close.
  useEffect(() => {
    previouslyFocused.current = document.activeElement;
    const t = setTimeout(() => titleRef.current?.focus(), 0);
    return () => {
      clearTimeout(t);
      (previouslyFocused.current as HTMLElement | null)?.focus?.();
    };
  }, []);

  // Emit the current detail up to the board (recomputing the meta-footer counts).
  const emit = useCallback(
    (d: PageDetailResponse) => {
      const next = withCounts(d);
      setDetail(next);
      onPageChange(next);
    },
    [onPageChange],
  );

  // ── Debounced autosave (title/description/dueDate/labels) ────────────────────
  const flush = useCallback(async () => {
    const delta = pendingRef.current;
    pendingRef.current = {};
    if (Object.keys(delta).length === 0) return;
    setSaveState('saving');
    try {
      const updated = await updatePage(pageId, delta);
      setSaveState('saved');
      setDetail((prev) => (prev ? withCounts({ ...prev, ...updated }) : prev));
      onPageChange(updated);
    } catch {
      setSaveState('error');
    }
  }, [pageId, onPageChange]);

  const schedule = useCallback(
    (delta: UpdatePageRequest) => {
      pendingRef.current = { ...pendingRef.current, ...delta };
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => void flush(), 600);
    },
    [flush],
  );

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
    }
  }

  if (loadError) {
    return (
      <Overlay onBackdrop={onClose}>
        <Panel panelRef={panelRef} titleId={titleId} onKeyDown={onKeyDown}>
          <div role="alert" style={{ padding: 24, fontSize: 14, fontWeight: 700 }}>
            <span id={titleId}>Carte introuvable.</span>
            <div style={{ marginTop: 12 }}>
              <button type="button" onClick={onClose} style={secondaryBtn}>
                Fermer
              </button>
            </div>
          </div>
        </Panel>
      </Overlay>
    );
  }

  if (!detail) {
    return (
      <Overlay onBackdrop={onClose}>
        <Panel panelRef={panelRef} titleId={titleId} onKeyDown={onKeyDown}>
          <div role="status" aria-label="Chargement de la carte…" style={{ padding: 18 }}>
            <span id={titleId} style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}>
              Chargement de la carte…
            </span>
            {[52, 90, 40, 70, 120].map((h, i) => (
              <div
                key={i}
                aria-hidden="true"
                className="ep-skeleton-delayed"
                style={{ height: h, background: 'var(--tone)', opacity: 0.35, borderRadius: 8, marginBottom: 12 }}
              />
            ))}
          </div>
        </Panel>
      </Overlay>
    );
  }

  const appliedLabelIds = detail.labels.map((l) => l.id);
  const assigneeIds = detail.assignees.map((a) => a.accountId);

  // ── ÉTIQUETTES: toggle apply/remove (debounced with the other simple fields) ──
  function toggleLabel(label: ProjectLabelItem) {
    if (readOnly || !detail) return;
    const has = appliedLabelIds.includes(label.id);
    const nextLabels = has
      ? detail.labels.filter((l) => l.id !== label.id)
      : [...detail.labels, label];
    emit({ ...detail, labels: nextLabels });
    schedule({ labelIds: nextLabels.map((l) => l.id) });
  }

  // ── ASSIGNÉ À: immediate + optimistic (server fires the add/remove notifications) ──
  async function toggleAssignee(m: WorkspaceMember) {
    if (readOnly || !detail) return;
    const has = assigneeIds.includes(m.accountId);
    const prev = detail;
    const nextAssignees = has
      ? detail.assignees.filter((a) => a.accountId !== m.accountId)
      : [...detail.assignees, { accountId: m.accountId, displayName: m.displayName, avatar: m.avatar }];
    emit({ ...detail, assignees: nextAssignees });
    try {
      const updated = await updatePage(pageId, { assigneeIds: nextAssignees.map((a) => a.accountId) });
      setDetail((d) => (d ? withCounts({ ...d, ...updated }) : d));
      onPageChange(updated);
    } catch {
      setDetail(prev);
      onPageChange(prev);
    }
  }

  async function onStageChange(stage: PageStage) {
    if (readOnly || !detail) return;
    const prev = detail;
    emit({ ...detail, stage });
    try {
      const updated = await updatePageStage(pageId, stage);
      setDetail((d) => (d ? withCounts({ ...d, ...updated }) : d));
      onPageChange(updated);
    } catch {
      setDetail(prev);
      onPageChange(prev);
    }
  }

  function onTypeChange(type: 'simple' | 'double') {
    if (readOnly || !detail) return;
    const base = detail.fileTags.filter((t) => t !== 'double');
    const next: PageFileTag[] = type === 'double' ? [...base, 'double'] : base;
    emit({ ...detail, fileTags: next });
    schedule({ fileTags: next });
  }

  async function onDelete() {
    try {
      await deletePage(pageId);
      onDeleted(pageId);
      onClose();
    } catch {
      setConfirmDelete(false);
    }
  }

  const memberOnly = !readOnly;
  const isDouble = detail.fileTags.includes('double');

  // Merge an asset (linked or re-versioned) into the FICHIERS state AND bubble the page so the board's
  // derived badge/chips re-render (D-D/D-E). De-dupe by id (a re-link replaces the same asset).
  function applyAssets(next: AssetItem[]) {
    if (!detail) return;
    setAssets(next);
    emit({ ...detail, linkedFiles: next.map(toRef), linkedFileIds: next.map((a) => a.id) });
  }
  function upsertAsset(updated: AssetItem) {
    const base = assets ?? [];
    applyAssets(base.some((a) => a.id === updated.id) ? base.map((a) => (a.id === updated.id ? updated : a)) : [...base, updated]);
  }
  // Detach a file from this card (F7). No confirm (non-destructive, D-K) — the file stays in Fichiers.
  async function unlinkAsset(a: AssetItem) {
    const base = assets ?? [];
    const prev = base;
    applyAssets(base.filter((x) => x.id !== a.id)); // optimistic — drop the row + re-derive the badge
    try {
      await unlinkAssetFromPage(a.id);
    } catch {
      applyAssets(prev); // restore on failure
    }
  }

  return (
    <Overlay onBackdrop={onClose}>
      <Panel panelRef={panelRef} titleId={titleId} onKeyDown={onKeyDown}>
        {/* Pinned header (title + close + save state) — the body below scrolls under it. */}
        <div style={{ flex: 'none', padding: 18, borderBottom: '2px solid var(--border)', background: 'var(--card)' }}>
        {/* Header — editable title + close */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 4 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <label htmlFor={titleId} style={sectionLabel}>
              TITRE
            </label>
            <input
              id={titleId}
              ref={titleRef}
              value={title}
              readOnly={readOnly}
              onChange={(e) => {
                const v = e.target.value;
                setTitle(v);
                if (readOnly) return;
                if (!v.trim()) {
                  setTitleError('Un titre est requis');
                  return;
                }
                setTitleError(null);
                schedule({ title: v.trim() });
              }}
              style={{ ...inputStyle, fontFamily: 'var(--font-display)', fontSize: 18 }}
            />
            {titleError && (
              <div role="alert" style={errText}>
                {titleError}
              </div>
            )}
          </div>
          <button type="button" aria-label="Fermer" onClick={onClose} style={closeBtn}>
            ✕
          </button>
        </div>

        <span aria-live="polite" style={{ display: 'block', fontSize: 12, fontWeight: 700, minHeight: 16, color: saveState === 'error' ? 'var(--accent)' : 'var(--ink2)' }}>
          {saveState === 'saving' && 'Enregistrement…'}
          {saveState === 'saved' && 'Enregistré ✓'}
          {saveState === 'error' && "L'enregistrement a échoué. Réessayez."}
        </span>
        </div>

        {/* Scrolling body */}
        <div style={{ flex: '1 1 auto', overflowY: 'auto', padding: 18 }}>
        {/* COLONNE + TYPE DE PAGE */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 10 }}>
          <div style={{ flex: '1 1 160px', minWidth: 0 }}>
            <div style={sectionLabel}>COLONNE</div>
            <OnBrandSelect
              aria-label="Colonne"
              value={detail.stage}
              disabled={readOnly}
              onChange={(e) => void onStageChange(e.target.value as PageStage)}
            >
              {PAGE_STAGES.map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABELS[s]}
                </option>
              ))}
            </OnBrandSelect>
          </div>
          <div style={{ flex: '1 1 160px', minWidth: 0 }}>
            <div style={sectionLabel}>TYPE DE PAGE</div>
            <OnBrandSelect
              aria-label="Type de page"
              value={isDouble ? 'double' : 'simple'}
              disabled={readOnly}
              onChange={(e) => onTypeChange(e.target.value as 'simple' | 'double')}
            >
              <option value="simple">Simple</option>
              <option value="double">⇿ Double page</option>
            </OnBrandSelect>
          </div>
        </div>

        {/* FICHIERS (par type) — Scénario / Dessin / Page / Références, wired to CS-3 assets. */}
        <div style={{ marginTop: 16 }}>
          <div style={sectionLabel}>FICHIERS</div>
          {assetsError ? (
            <div role="alert" style={errText}>
              Impossible de charger les fichiers.
            </div>
          ) : assets === null ? (
            <div role="status" aria-label="Chargement des fichiers…" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[36, 36].map((h, i) => (
                <div key={i} aria-hidden="true" className="ep-skeleton-delayed" style={{ height: h, background: 'var(--tone)', opacity: 0.35, borderRadius: 8 }} />
              ))}
            </div>
          ) : (
            // 2×2 grid on desktop, collapses to a single column below ~440px (no media query needed).
            // `align-items: start` keeps a file-heavy section from stretching its empty neighbour.
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, alignItems: 'start' }}>
              {FICHIERS_SECTIONS.map((sec) => {
                const files = assets.filter((a) => sec.types.includes(a.type));
                return (
                  <div key={sec.label} style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
                        {sec.label}
                      </span>
                      {sec.hint && <span style={{ fontSize: 11, color: 'var(--ink2)', fontWeight: 500 }}>{sec.hint}</span>}
                      {memberOnly && (
                        <button
                          type="button"
                          aria-label={`Lier un fichier (${sec.label})`}
                          title="Lier · remplacer un fichier"
                          onClick={() => setLinkPicker({ types: sec.types, canonical: sec.canonical, label: sec.label })}
                          style={{ ...plusBtn, marginLeft: 'auto' }}
                        >
                          ＋ Lier
                        </button>
                      )}
                    </div>
                    {files.length === 0 ? (
                      <span style={mutedText}>Aucun fichier</span>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {files.map((a) => (
                          // Two-line card: name + version on top, actions below — stays clean even in a
                          // narrow 2×2 grid column (no messy mid-row wrapping).
                          <div
                            key={a.id}
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              gap: 6,
                              border: '2px solid var(--ink)',
                              borderRadius: 8,
                              padding: '7px 9px',
                              minWidth: 0,
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                              <span style={{ flex: 'none', display: 'inline-flex' }}>
                                {sec.icon === 'doc' ? <FileTextIcon size={14} /> : <ImageIcon size={14} />}
                              </span>
                              <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {a.filename}
                              </span>
                              <span style={{ ...chipStyle, flex: 'none', padding: '1px 7px', fontSize: 11, color: '#000' }}>v{a.currentVersion}</span>
                            </div>
                            <div style={{ display: 'flex', gap: 5, flexWrap: 'nowrap', alignItems: 'stretch', minWidth: 0 }}>
                              <button
                                type="button"
                                onClick={() => setPreviewTarget(a)}
                                aria-label={`Aperçu de ${a.filename}`}
                                disabled={!a.previewable}
                                style={{ ...rowBtn, opacity: a.previewable ? 1 : 0.5 }}
                              >
                                <EyeIcon size={12} /> Aperçu
                              </button>
                              <button
                                type="button"
                                onClick={() => setVersionsTarget(a)}
                                aria-label={`Historique des versions de ${a.filename}`}
                                style={rowBtn}
                              >
                                Historique
                              </button>
                              {memberOnly && (
                                <button
                                  type="button"
                                  onClick={() => void unlinkAsset(a)}
                                  aria-label={`Retirer ${a.filename} de la carte`}
                                  style={{ ...rowBtn, color: '#fff', background: 'var(--accent)', borderColor: 'var(--accent)' }}
                                >
                                  Retirer
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* DESCRIPTION */}
        <Section label="DESCRIPTION">
          <textarea
            aria-label="Description"
            value={description}
            readOnly={readOnly}
            onChange={(e) => {
              setDescription(e.target.value);
              if (!readOnly) schedule({ description: e.target.value });
            }}
            style={{ ...inputStyle, height: 84, lineHeight: 1.5, resize: 'vertical' }}
          />
        </Section>

        {/* ÉTIQUETTES */}
        <Section label="ÉTIQUETTES">
          <LabelsSection
            slug={slug}
            palette={labels}
            applied={detail.labels}
            readOnly={readOnly}
            onToggle={toggleLabel}
            onPaletteChange={onLabelsChange}
            onLabelRemovedFromDetail={(id) => {
              if (!detail) return;
              const nextLabels = detail.labels.filter((l) => l.id !== id);
              emit({ ...detail, labels: nextLabels });
            }}
          />
        </Section>

        {/* ÉCHÉANCE */}
        <Section label="ÉCHÉANCE">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                border: '2px solid var(--ink)',
                borderRadius: 8,
                background: 'var(--paper)',
                padding: '6px 10px',
              }}
            >
              <CalendarIcon size={16} />
              <input
                type="date"
                aria-label="Échéance"
                value={dueDate}
                readOnly={readOnly}
                onChange={(e) => {
                  setDueDate(e.target.value);
                  if (!readOnly) schedule({ dueDate: e.target.value || null });
                }}
                style={{
                  border: 'none',
                  background: 'transparent',
                  fontFamily: 'inherit',
                  fontSize: 14,
                  fontWeight: 700,
                  color: 'var(--ink)',
                }}
              />
            </span>
            {dueDate && !readOnly && (
              <button
                type="button"
                onClick={() => {
                  setDueDate('');
                  schedule({ dueDate: null });
                }}
                style={secondaryBtn}
              >
                Retirer
              </button>
            )}
          </div>
        </Section>

        {/* CHECKLIST */}
        <Section label="CHECKLIST">
          <ChecklistSection
            pageId={pageId}
            items={detail.checklist}
            readOnly={readOnly}
            onChange={(items) => emit({ ...detail, checklist: items })}
          />
        </Section>

        {/* ASSIGNÉ À */}
        <Section label="ASSIGNÉ À">
          {members.length === 0 ? (
            <div style={mutedText}>Aucun membre</div>
          ) : (
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
              {members.map((m) => {
                const active = assigneeIds.includes(m.accountId);
                return (
                  <button
                    key={m.accountId}
                    type="button"
                    disabled={readOnly}
                    aria-pressed={active}
                    onClick={() => void toggleAssignee(m)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      border: '2px solid var(--ink)',
                      borderRadius: 20,
                      padding: '4px 11px 4px 5px',
                      fontSize: 13,
                      fontWeight: 700,
                      fontFamily: 'inherit',
                      cursor: readOnly ? 'default' : 'pointer',
                      background: active ? 'var(--accent)' : 'var(--card)',
                      color: active ? '#fff' : 'var(--ink)',
                      minHeight: 32,
                    }}
                  >
                    <Avatar name={m.displayName} avatar={m.avatar} active={active} />
                    {m.displayName}
                  </button>
                );
              })}
            </div>
          )}
        </Section>

        {/* COMMENTAIRES */}
        <Section label="COMMENTAIRES">
          <CommentsSection
            pageId={pageId}
            members={members}
            comments={detail.comments}
            viewerId={viewerId}
            isOwner={isOwner}
            readOnly={readOnly}
            onChange={(comments) => emit({ ...detail, comments })}
          />
        </Section>

        {/* Members-only delete */}
        {memberOnly && (
          <div style={{ marginTop: 18, borderTop: '2px solid var(--border)', paddingTop: 14 }}>
            <button type="button" onClick={() => setConfirmDelete(true)} style={{ ...secondaryBtn, color: '#c0392b', borderColor: '#c0392b' }}>
              Supprimer la carte
            </button>
          </div>
        )}
        </div>
      </Panel>
      {confirmDelete && (
        <ConfirmDialog
          title="Supprimer la carte ?"
          message={`« ${title} » et son contenu (checklist, commentaires) seront définitivement supprimés.`}
          confirmLabel="Supprimer"
          onConfirm={() => void onDelete()}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
      {previewTarget && (
        <AssetPreviewOverlay
          assetId={previewTarget.id}
          filename={previewTarget.filename}
          version={previewTarget.currentVersion}
          onClose={() => setPreviewTarget(null)}
        />
      )}
      {versionsTarget && (
        <AssetVersionsModal
          slug={slug}
          asset={versionsTarget}
          readOnly={readOnly}
          onClose={() => setVersionsTarget(null)}
          onUpdated={(updated) => {
            upsertAsset(updated);
            setVersionsTarget(updated);
          }}
        />
      )}
      {linkPicker && (
        <LinkAssetPicker
          slug={slug}
          pageId={pageId}
          types={linkPicker.types}
          canonicalType={linkPicker.canonical}
          sectionLabel={linkPicker.label}
          onClose={() => setLinkPicker(null)}
          onLinked={(a) => {
            upsertAsset(a);
            setLinkPicker(null);
          }}
        />
      )}
    </Overlay>
  );
}

// ── Overlay + panel shell (proto [data-card-modal]) ────────────────────────────
function Overlay({ children, onBackdrop }: { children: React.ReactNode; onBackdrop: () => void }) {
  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onBackdrop();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 70,
        background: 'rgba(22,19,15,.55)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '4vh 12px',
        overflowY: 'auto',
      }}
    >
      {children}
    </div>
  );
}

function Panel({
  children,
  panelRef,
  titleId,
  onKeyDown,
}: {
  children: React.ReactNode;
  panelRef: React.RefObject<HTMLDivElement | null>;
  titleId: string;
  onKeyDown: (e: React.KeyboardEvent) => void;
}) {
  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onKeyDown={onKeyDown}
      style={{
        width: 480,
        maxWidth: '100%',
        maxHeight: '88vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--card)',
        border: '3px solid var(--ink)',
        borderRadius: 12,
        boxShadow: '7px 7px 0 var(--shadow)',
        boxSizing: 'border-box',
      }}
    >
      {children}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 16 }}>
      <div style={sectionLabel}>{label}</div>
      {children}
    </div>
  );
}

function Avatar({ name, avatar, active }: { name: string; avatar: string | null; active?: boolean }) {
  if (avatar) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={avatar} alt="" width={22} height={22} style={{ width: 22, height: 22, borderRadius: '50%', border: '2px solid var(--ink)', objectFit: 'cover', display: 'block' }} />;
  }
  return (
    <span
      aria-hidden="true"
      title={name}
      style={{
        width: 22,
        height: 22,
        borderRadius: '50%',
        border: '2px solid var(--ink)',
        background: active
          ? '#fff'
          : 'var(--tone) radial-gradient(var(--ink) 1.4px,transparent 1.5px) 0 0 / 5px 5px',
        display: 'block',
        flex: 'none',
      }}
    />
  );
}

// ── ÉTIQUETTES ─────────────────────────────────────────────────────────────────
function LabelsSection({
  slug,
  palette,
  applied,
  readOnly,
  onToggle,
  onPaletteChange,
  onLabelRemovedFromDetail,
}: {
  slug: string;
  palette: ProjectLabelItem[];
  applied: ProjectLabelItem[];
  readOnly?: boolean;
  onToggle: (label: ProjectLabelItem) => void;
  onPaletteChange: (labels: ProjectLabelItem[]) => void;
  onLabelRemovedFromDetail: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState<string>(LABEL_COLORS[0]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState<string>(LABEL_COLORS[0]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const appliedIds = applied.map((l) => l.id);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close the dropdown on outside click / Escape (same pattern as GenreSuggestInput).
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  async function create() {
    const name = newName.trim();
    if (!name) return;
    try {
      const created = await createProjectLabel(slug, { name, color: newColor });
      onPaletteChange([...palette, created]);
      setNewName('');
      setNewColor(LABEL_COLORS[0]);
    } catch {
      /* keep the form open on error */
    }
  }

  async function saveEdit(id: string) {
    const name = editName.trim();
    if (!name) return;
    try {
      const updated = await updateProjectLabel(id, { name, color: editColor });
      onPaletteChange(palette.map((l) => (l.id === id ? updated : l)));
      setEditingId(null);
    } catch {
      /* noop */
    }
  }

  async function remove(id: string) {
    try {
      await deleteProjectLabel(id);
      onPaletteChange(palette.filter((l) => l.id !== id));
      onLabelRemovedFromDetail(id);
      setConfirmDeleteId(null);
    } catch {
      setConfirmDeleteId(null);
    }
  }

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      {/* Applied chips (click the ✕ to remove) + a click-to-add control (like the genre tags) */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {applied.map((l) => (
          <span
            key={l.id}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              border: '2px solid var(--ink)',
              borderRadius: 6,
              padding: '3px 4px 3px 9px',
              fontSize: 12,
              fontWeight: 700,
              background: l.color,
              color: '#fff',
            }}
          >
            {l.name}
            {!readOnly && (
              <button
                type="button"
                aria-label={`Retirer ${l.name}`}
                onClick={() => onToggle(l)}
                style={{ border: 'none', background: 'transparent', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, padding: '0 3px' }}
              >
                ✕
              </button>
            )}
          </span>
        ))}
        {applied.length === 0 && readOnly && <span style={mutedText}>Aucune étiquette</span>}
        {!readOnly && (
          <button
            type="button"
            aria-label="Ajouter une étiquette"
            aria-haspopup="true"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            style={{ ...tinyBtn, display: 'inline-flex', alignItems: 'center', gap: 5 }}
          >
            <TagIcon size={13} />＋ Étiquette
          </button>
        )}
      </div>

      {/* Dropdown — all étiquettes (toggle applies/removes) + inline create/rename/delete */}
      {open && !readOnly && (
        <div
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setOpen(false);
            }
          }}
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 10,
            width: 280,
            maxWidth: '100%',
            background: 'var(--card)',
            border: '2px solid var(--ink)',
            borderRadius: 8,
            boxShadow: '4px 4px 0 var(--shadow)',
            padding: 8,
            display: 'flex',
            flexDirection: 'column',
            gap: 5,
          }}
        >
          {palette.length === 0 && <div style={mutedText}>Aucune étiquette pour le moment</div>}
          {palette.map((l) => {
            const on = appliedIds.includes(l.id);
            if (editingId === l.id) {
              return (
                <div key={l.id} style={{ display: 'flex', flexDirection: 'column', gap: 6, border: '2px solid var(--ink)', borderRadius: 6, padding: 8 }}>
                  <input
                    aria-label="Renommer l'étiquette"
                    value={editName}
                    maxLength={30}
                    onChange={(e) => setEditName(e.target.value)}
                    style={inputStyle}
                  />
                  <Swatches value={editColor} onPick={setEditColor} />
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" onClick={() => void saveEdit(l.id)} style={primaryBtn}>
                      Enregistrer
                    </button>
                    <button type="button" onClick={() => setEditingId(null)} style={secondaryBtn}>
                      Annuler
                    </button>
                  </div>
                </div>
              );
            }
            return (
              <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  type="button"
                  disabled={readOnly}
                  aria-pressed={on}
                  onClick={() => onToggle(l)}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    border: '2px solid var(--ink)',
                    borderRadius: 6,
                    padding: '5px 9px',
                    fontSize: 13,
                    fontWeight: 700,
                    fontFamily: 'inherit',
                    textAlign: 'left',
                    cursor: readOnly ? 'default' : 'pointer',
                    background: on ? 'var(--accent-soft)' : 'var(--card)',
                    color: 'var(--ink)',
                  }}
                >
                  <span aria-hidden="true" style={{ width: 16, height: 16, borderRadius: 4, background: l.color, border: '1.5px solid var(--ink)', flex: 'none' }} />
                  {l.name}
                  {on && <span aria-hidden="true" style={{ marginLeft: 'auto' }}>✓</span>}
                </button>
                {!readOnly &&
                  (confirmDeleteId === l.id ? (
                    <span style={{ display: 'inline-flex', gap: 5, alignItems: 'center', fontSize: 12, fontWeight: 700 }}>
                      Supprimer l&apos;étiquette ?
                      <button type="button" onClick={() => void remove(l.id)} style={{ ...tinyBtn, color: '#c0392b' }}>
                        Oui
                      </button>
                      <button type="button" onClick={() => setConfirmDeleteId(null)} style={tinyBtn}>
                        Non
                      </button>
                    </span>
                  ) : (
                    <>
                      <button
                        type="button"
                        aria-label={`Renommer ${l.name}`}
                        onClick={() => {
                          setEditingId(l.id);
                          setEditName(l.name);
                          setEditColor(l.color);
                        }}
                        style={tinyBtn}
                      >
                        Renommer
                      </button>
                      <button type="button" aria-label={`Supprimer ${l.name}`} onClick={() => setConfirmDeleteId(l.id)} style={tinyBtn}>
                        Supprimer
                      </button>
                    </>
                  ))}
              </div>
            );
          })}

          {/* Inline creator (always available inside the dropdown) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: '2px solid var(--border)', paddingTop: 8, marginTop: 3 }}>
            <div style={{ ...sectionLabel, marginBottom: 0 }}>Nouvelle étiquette</div>
            <input
              aria-label="Nom de l'étiquette"
              placeholder="Nom de l'étiquette"
              value={newName}
              maxLength={30}
              onChange={(e) => setNewName(e.target.value)}
              style={inputStyle}
            />
            <Swatches value={newColor} onPick={setNewColor} />
            <button type="button" onClick={() => void create()} style={{ ...primaryBtn, alignSelf: 'flex-start' }}>
              Créer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Swatches({ value, onPick }: { value: string; onPick: (c: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {LABEL_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={LABEL_COLOR_NAMES[c]}
          aria-pressed={value === c}
          onClick={() => onPick(c)}
          style={{
            width: 26,
            height: 26,
            borderRadius: 6,
            background: c,
            border: value === c ? '3px solid var(--ink)' : '2px solid var(--ink2)',
            cursor: 'pointer',
          }}
        />
      ))}
    </div>
  );
}

// ── CHECKLIST ────────────────────────────────────────────────────────────────
function ChecklistSection({
  pageId,
  items,
  readOnly,
  onChange,
}: {
  pageId: string;
  items: PageChecklistItemDto[];
  readOnly?: boolean;
  onChange: (items: PageChecklistItemDto[]) => void;
}) {
  const [text, setText] = useState('');
  const total = items.length;
  const done = items.filter((i) => i.done).length;

  async function toggle(item: PageChecklistItemDto) {
    if (readOnly) return;
    const prev = items;
    onChange(items.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)));
    try {
      await updateChecklistItem(item.id, { done: !item.done });
    } catch {
      onChange(prev);
    }
  }

  async function add() {
    const t = text.trim();
    if (!t) return;
    setText('');
    try {
      const created = await addChecklistItem(pageId, { text: t });
      onChange([...items, created]);
    } catch {
      setText(t);
    }
  }

  async function remove(item: PageChecklistItemDto) {
    if (readOnly) return;
    const prev = items;
    onChange(items.filter((i) => i.id !== item.id));
    try {
      await deleteChecklistItem(item.id);
    } catch {
      onChange(prev);
    }
  }

  return (
    <div>
      {total > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}>
          <div style={{ flex: 1, height: 8, background: 'var(--ink)', borderRadius: 5, overflow: 'hidden' }}>
            <div style={{ width: `${Math.round((done / total) * 100)}%`, height: '100%', background: 'var(--accent)' }} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)' }}>
            ({done}/{total})
          </span>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {items.map((item) => (
          <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <OnBrandCheckbox
              checked={item.done}
              disabled={readOnly}
              onChange={() => void toggle(item)}
              label={<span style={{ fontSize: 14, textDecoration: item.done ? 'line-through' : 'none', color: item.done ? 'var(--ink2)' : 'var(--ink)' }}>{item.text}</span>}
              style={{ flex: 1 }}
            />
            {!readOnly && (
              <button type="button" aria-label="Supprimer l'élément" onClick={() => void remove(item)} style={tinyBtn}>
                ✕
              </button>
            )}
          </div>
        ))}
      </div>
      {!readOnly && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <input
            aria-label="Nouvel élément"
            placeholder="Ajouter un élément…"
            value={text}
            maxLength={200}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void add();
              }
            }}
            style={{ ...inputStyle, flex: 1 }}
          />
          <button type="button" onClick={() => void add()} style={primaryBtn}>
            Ajouter
          </button>
        </div>
      )}
      {total === 0 && readOnly && <div style={mutedText}>Aucun élément</div>}
    </div>
  );
}

// ── COMMENTAIRES ────────────────────────────────────────────────────────────────
function CommentsSection({
  pageId,
  members,
  comments,
  viewerId,
  isOwner,
  readOnly,
  onChange,
}: {
  pageId: string;
  members: WorkspaceMember[];
  comments: PageCommentItem[];
  viewerId: string | null;
  isOwner: boolean;
  readOnly?: boolean;
  onChange: (comments: PageCommentItem[]) => void;
}) {
  const [body, setBody] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState('');
  const composerRef = useRef<HTMLTextAreaElement>(null);

  // @name autocomplete: match the trailing "@token" at the end of the composer (caret sits there
  // while the mention is being typed — the "trailing @query" the story describes).
  const mentionQuery = useMemo(() => {
    const m = /@(\S*)$/.exec(body);
    return m ? m[1] : null;
  }, [body]);

  const suggestions = useMemo(() => {
    if (mentionQuery === null) return [];
    const q = mentionQuery.toLowerCase();
    return members.filter((m) => m.displayName.toLowerCase().includes(q)).slice(0, 6);
  }, [mentionQuery, members]);

  function insertMention(m: WorkspaceMember) {
    const next = body.replace(/@(\S*)$/, `@${m.displayName} `);
    setBody(next);
    requestAnimationFrame(() => {
      composerRef.current?.focus();
      composerRef.current?.setSelectionRange(next.length, next.length);
    });
  }

  async function submit() {
    const t = body.trim();
    if (!t) return;
    setBody('');
    try {
      const created = await addPageComment(pageId, { body: t });
      onChange([...comments, created]);
    } catch {
      setBody(t);
    }
  }

  async function saveEdit(id: string) {
    const t = editBody.trim();
    if (!t) return;
    const prev = comments;
    setEditingId(null);
    try {
      const updated = await updatePageComment(id, { body: t });
      onChange(comments.map((c) => (c.id === id ? updated : c)));
    } catch {
      onChange(prev);
    }
  }

  async function remove(id: string) {
    const prev = comments;
    onChange(comments.filter((c) => c.id !== id));
    try {
      await deletePageComment(id);
    } catch {
      onChange(prev);
    }
  }

  return (
    <div>
      {comments.length === 0 && <div style={mutedText}>Aucun commentaire</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {comments.map((c) => {
          const isAuthor = viewerId !== null && c.authorId === viewerId;
          const canDelete = isAuthor || isOwner;
          return (
            <div key={c.id} style={{ display: 'flex', gap: 8 }}>
              <Avatar name={c.authorName} avatar={c.authorAvatar} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, flexWrap: 'wrap' }}>
                  <b style={{ fontSize: 13 }}>{c.authorName}</b>
                  <span style={{ fontSize: 11, color: 'var(--ink2)', fontWeight: 700 }}>{relativeTime(c.createdAt)}</span>
                  {c.editedAt && <span style={{ fontSize: 11, color: 'var(--ink2)', fontStyle: 'italic' }}>modifié</span>}
                </div>
                {editingId === c.id ? (
                  <div style={{ marginTop: 4 }}>
                    <textarea
                      aria-label="Modifier le commentaire"
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      style={{ ...inputStyle, height: 60, resize: 'vertical' }}
                    />
                    <div style={{ display: 'flex', gap: 6, marginTop: 5 }}>
                      <button type="button" onClick={() => void saveEdit(c.id)} style={primaryBtn}>
                        Enregistrer
                      </button>
                      <button type="button" onClick={() => setEditingId(null)} style={secondaryBtn}>
                        Annuler
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: 14, color: 'var(--ink)', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{c.body}</div>
                    {!readOnly && (isAuthor || canDelete) && (
                      <div style={{ display: 'flex', gap: 8, marginTop: 3 }}>
                        {isAuthor && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingId(c.id);
                              setEditBody(c.body);
                            }}
                            style={linkBtn}
                          >
                            Modifier
                          </button>
                        )}
                        {canDelete && (
                          <button type="button" onClick={() => void remove(c.id)} style={linkBtn}>
                            Supprimer
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Composer */}
      {!readOnly && (
        <div style={{ marginTop: 10, position: 'relative' }}>
          <textarea
            ref={composerRef}
            aria-label="Écrire un commentaire"
            placeholder="Écrire un commentaire… (mentionnez avec @)"
            value={body}
            maxLength={2000}
            onChange={(e) => setBody(e.target.value)}
            style={{ ...inputStyle, height: 64, resize: 'vertical' }}
          />
          {suggestions.length > 0 && (
            <ul
              role="listbox"
              aria-label="Mentionner un membre"
              style={{
                listStyle: 'none',
                margin: 0,
                padding: 5,
                position: 'absolute',
                left: 0,
                right: 0,
                zIndex: 5,
                background: 'var(--card)',
                border: '2px solid var(--ink)',
                borderRadius: 8,
                boxShadow: '3px 3px 0 var(--shadow)',
                maxHeight: 180,
                overflow: 'auto',
              }}
            >
              {suggestions.map((m) => (
                <li key={m.accountId}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => insertMention(m)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 7,
                      width: '100%',
                      textAlign: 'left',
                      border: 'none',
                      background: 'transparent',
                      borderRadius: 5,
                      padding: '5px 7px',
                      fontSize: 13,
                      fontWeight: 700,
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                      color: 'var(--ink)',
                    }}
                  >
                    <Avatar name={m.displayName} avatar={m.avatar} />@{m.displayName}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
            <button type="button" disabled={!body.trim()} onClick={() => void submit()} style={{ ...primaryBtn, opacity: body.trim() ? 1 : 0.5 }}>
              Commenter
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Shared styles ──────────────────────────────────────────────────────────────
const sectionLabel: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '.05em',
  color: 'var(--ink2)',
  marginBottom: 6,
  textTransform: 'uppercase',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '2px solid var(--ink)',
  borderRadius: 8,
  padding: '8px 11px',
  fontSize: 14,
  fontFamily: 'inherit',
  background: 'var(--card)',
  color: 'var(--ink)',
  boxSizing: 'border-box',
};

const chipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  fontSize: 12,
  fontWeight: 700,
  border: '2px solid var(--ink)',
  borderRadius: 5,
  padding: '2px 8px',
  background: 'var(--paper)',
};

const mutedText: React.CSSProperties = { fontSize: 13, color: 'var(--ink2)', fontStyle: 'italic' };
const errText: React.CSSProperties = { fontSize: 12, color: 'var(--accent)', marginTop: 5, fontWeight: 700 };

const primaryBtn: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  border: '2px solid var(--ink)',
  borderRadius: 7,
  padding: '7px 14px',
  cursor: 'pointer',
  background: 'var(--accent)',
  color: '#fff',
  fontFamily: 'inherit',
  minHeight: 36,
};

const secondaryBtn: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  border: '2px solid var(--ink)',
  borderRadius: 7,
  padding: '7px 14px',
  cursor: 'pointer',
  background: 'var(--card)',
  color: 'var(--ink)',
  fontFamily: 'inherit',
  minHeight: 36,
};

const tinyBtn: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  border: '1.5px solid var(--ink)',
  borderRadius: 5,
  padding: '3px 7px',
  cursor: 'pointer',
  background: 'var(--card)',
  color: 'var(--ink)',
  fontFamily: 'inherit',
  minHeight: 28,
};

// Per-file row action (Aperçu / Historique / Retirer) — share the row width, single line, and
// clip (never overflow) when the section column is narrow.
const rowBtn: React.CSSProperties = {
  flex: '1 1 0',
  minWidth: 0,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 3,
  fontSize: 11,
  fontWeight: 700,
  border: '1.5px solid var(--ink)',
  borderRadius: 5,
  padding: '4px 5px',
  cursor: 'pointer',
  background: 'var(--card)',
  color: 'var(--ink)',
  fontFamily: 'inherit',
  minHeight: 28,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

// Compact red (accent) "＋ Lier" affordance next to each FICHIERS section label — opens the link picker.
const plusBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 3,
  minHeight: 24,
  fontSize: 12,
  fontWeight: 700,
  lineHeight: 1,
  border: '1.5px solid var(--ink)',
  borderRadius: 5,
  cursor: 'pointer',
  background: 'var(--accent)',
  color: '#fff',
  fontFamily: 'inherit',
  padding: '3px 8px',
};

const linkBtn: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: 'var(--ink2)',
  fontSize: 12,
  fontWeight: 700,
  textDecoration: 'underline',
  cursor: 'pointer',
  fontFamily: 'inherit',
  padding: 0,
};

const closeBtn: React.CSSProperties = {
  flex: 'none',
  border: '2px solid var(--ink)',
  borderRadius: 7,
  background: 'var(--card)',
  color: 'var(--ink)',
  fontSize: 14,
  fontWeight: 700,
  width: 34,
  height: 34,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
