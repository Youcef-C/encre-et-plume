'use client';

// CS-5 — Révision & corrections. Client orchestrator for the review screen (`data-page="nemu"` replica).
// Loads the two-version review payload, renders the Scénario/Dessin surface + the unified corrections
// list + the dessin composer, and wires create / status-change / delete / validate against the real API.
// Read-only fallback for non-members is the server's 403/404 → the access screen (payload never leaks).
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type {
  AssetItem,
  AssetType,
  CorrectionDto,
  CorrectionStatus,
  DessinRegion,
  ReviewPayload,
} from '@encre-et-plume/shared';
import { useSession } from '../../lib/session';
import * as api from '../../lib/api';
import ConfirmDialog from '../projet/ConfirmDialog';
import AssetVersionsModal from '../projet/AssetVersionsModal';
import ReviewHeader from './ReviewHeader';
import DessinSurface from './DessinSurface';
import CorrectionList from './CorrectionList';
import Composer from './Composer';
import { buildNumbering } from './shared';

type StatusFilter = '' | CorrectionStatus;

export interface ReviewClientProps {
  slug: string;
  pageId: string;
}

export default function ReviewClient({ slug, pageId }: ReviewClientProps) {
  const { account, loading: sessionLoading } = useSession();
  const router = useRouter();

  const [payload, setPayload] = useState<ReviewPayload | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [params, setParams] = useState<{ file?: string; from?: number; to?: number }>({});
  // A5 — bumped after a new dessin version is uploaded, to refetch the review payload (new head → the
  // old↔new compare shows the fresh art).
  const [reloadKey, setReloadKey] = useState(0);
  const [versionModal, setVersionModal] = useState<AssetItem | null>(null);

  // Mutation-owned canonical (unfiltered) correction list — seeded from the payload on each load.
  const [all, setAll] = useState<CorrectionDto[]>([]);
  const [morePage, setMorePage] = useState(1);
  const [loadingMore, setLoadingMore] = useState(false);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [draftRegion, setDraftRegion] = useState<DessinRegion | null>(null);
  const [composerBusy, setComposerBusy] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
  const [confirmDel, setConfirmDel] = useState<CorrectionDto | null>(null);

  const [validating, setValidating] = useState(false);
  const [validateError, setValidateError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Auth gate (mirrors the CS-4 editor shell).
  useEffect(() => {
    if (sessionLoading) return;
    if (!account) {
      router.replace(`/connexion?next=${encodeURIComponent(`/projet/${slug}/revision/${pageId}`)}`);
    }
  }, [account, sessionLoading, router, slug, pageId]);

  // Load / reload the review payload whenever the file/version params change.
  useEffect(() => {
    if (sessionLoading || !account) return;
    let alive = true;
    setLoadState('loading');
    api
      .getReview(pageId, params)
      .then((p) => {
        if (!alive) return;
        setPayload(p);
        setAll(p.corrections.items);
        setMorePage(1);
        setLoadState('ready');
      })
      .catch(() => alive && setLoadState('error'));
    return () => {
      alive = false;
    };
  }, [pageId, params, account, sessionLoading, reloadKey]);

  // Scroll the selected anchor into view (two-way row ↔ anchor selection).
  const surfaceRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!selectedId || !surfaceRef.current) return;
    const el = surfaceRef.current.querySelector(`[data-correction-id="${selectedId}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [selectedId]);

  // r4 — dessin-only revision page. Numbering derives from the dessin subset so box numbers stay
  // contiguous, but `allCorrige` stays computed over ALL corrections (scenario tagged-comments + dessin)
  // so the Valider button state matches the server's all-corrections 409 gate.
  const numberOf = useMemo(() => buildNumbering(all.filter((c) => c.type === 'dessin')), [all]);
  const allCorrige = all.every((c) => c.status === 'corrige');

  const visible = useMemo(
    () => all.filter((c) => c.type === 'dessin' && (statusFilter === '' || c.status === statusFilter)),
    [all, statusFilter],
  );

  const selectedAssetId = payload?.selected?.assetId ?? null;
  const dessinCorrections = all.filter((c) => c.type === 'dessin' && c.assetId === selectedAssetId);

  const flashToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 3200);
  };

  // ── header handlers ──────────────────────────────────────────────────────────
  const onSelectFile = (assetId: string) => {
    setSelectedId(null);
    setParams({ file: assetId });
  };
  const onFrom = (v: number) => setParams((p) => ({ ...p, file: selectedAssetId ?? p.file, from: v }));
  const onTo = (v: number) => setParams((p) => ({ ...p, file: selectedAssetId ?? p.file, to: v }));

  const onValidate = async () => {
    setValidating(true);
    setValidateError(null);
    try {
      await api.validateReview(pageId);
      flashToast('Corrections validées — la carte passe en Propre.');
      router.push(`/projet/${slug}`);
    } catch (err) {
      const e = err as { message?: string; unresolved?: number };
      setValidateError(
        e.unresolved != null ? `${e.unresolved} correction(s) restante(s) à corriger.` : e.message ?? 'Validation impossible.',
      );
    } finally {
      setValidating(false);
    }
  };

  // ── correction mutations ─────────────────────────────────────────────────────
  const createDessin = async (description: string) => {
    if (!selectedAssetId || !draftRegion) return;
    setComposerBusy(true);
    setComposerError(null);
    try {
      const created = await api.createCorrection(pageId, {
        type: 'dessin',
        assetId: selectedAssetId,
        anchor: { region: draftRegion },
        description,
      });
      setAll((list) => [...list, created]);
      setDraftRegion(null);
      flashToast('Correction demandée.');
    } catch (err) {
      setComposerError((err as { message?: string }).message ?? 'Impossible d’envoyer la demande.');
    } finally {
      setComposerBusy(false);
    }
  };

  const changeStatus = async (c: CorrectionDto, status: CorrectionStatus) => {
    setBusyId(c.id);
    setRowError(null);
    const prev = all;
    setAll((list) => list.map((x) => (x.id === c.id ? { ...x, status } : x)));
    try {
      const updated = await api.updateCorrection(c.id, { status });
      setAll((list) => list.map((x) => (x.id === c.id ? updated : x)));
    } catch (err) {
      setAll(prev); // rollback
      setRowError({ id: c.id, message: (err as { message?: string }).message ?? 'Changement de statut refusé.' });
    } finally {
      setBusyId(null);
    }
  };

  const doDelete = async (c: CorrectionDto) => {
    setBusyId(c.id);
    setRowError(null);
    const prev = all;
    setAll((list) => list.filter((x) => x.id !== c.id));
    try {
      await api.deleteCorrection(c.id);
    } catch (err) {
      setAll(prev);
      setRowError({ id: c.id, message: (err as { message?: string }).message ?? 'Suppression refusée.' });
    } finally {
      setBusyId(null);
    }
  };

  const loadMore = async () => {
    if (!payload) return;
    setLoadingMore(true);
    try {
      const next = await api.listCorrections(pageId, { page: morePage + 1 });
      setAll((list) => {
        const seen = new Set(list.map((c) => c.id));
        return [...list, ...next.items.filter((c) => !seen.has(c.id))];
      });
      setMorePage((p) => p + 1);
    } catch {
      /* transient — the row list still shows what loaded */
    } finally {
      setLoadingMore(false);
    }
  };

  // ── render states ────────────────────────────────────────────────────────────
  if (sessionLoading || loadState === 'loading' || !account) {
    return (
      <div role="status" aria-label="Chargement de la révision…" className="ep-skeleton-delayed" style={{ maxWidth: 1180, margin: '0 auto', padding: '24px 28px' }}>
        <div aria-hidden="true" style={{ height: 420, background: 'var(--tone)', opacity: 0.35, borderRadius: 10 }} />
      </div>
    );
  }
  if (loadState === 'error' || !payload) {
    return (
      <div style={{ maxWidth: 620, margin: '48px auto', padding: '0 20px' }}>
        <div style={{ border: '3px solid var(--ink)', borderRadius: 10, boxShadow: '6px 6px 0 var(--shadow)', background: 'var(--card)', padding: '28px 24px' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, textTransform: 'uppercase', marginBottom: 10 }}>Révision indisponible</div>
          <p style={{ fontSize: 14, color: 'var(--ink2)', marginBottom: 16 }}>Cette page n’existe pas ou vous n’y avez pas accès.</p>
          <Link href={`/projet/${slug}`} style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>‹ Projet</Link>
        </div>
      </div>
    );
  }

  const sel = payload.selected;
  // r4 — the revision page is dessin-only: the picker lists dessin files, and the surface renders only
  // when a dessin file is selected (a scenario-only page has no dessin file → the empty state).
  const dessinFiles = payload.files.filter((f) => f.surface === 'dessin');
  const dessinSel = sel && sel.surface === 'dessin' ? sel : null;

  // A5 — the selected dessin file as a (minimal) AssetItem, so we can reuse the CS-3 version-upload
  // modal (AssetVersionsModal only reads id/filename here; version history it fetches itself).
  const selectedFile = dessinFiles.find((f) => f.assetId === selectedAssetId);
  const openVersionModal = () => {
    if (!selectedFile) return;
    setVersionModal({
      id: selectedFile.assetId,
      type: selectedFile.type as AssetType,
      filename: selectedFile.filename,
      currentVersion: selectedFile.currentVersion,
      size: 0,
      thumbnailUrl: null,
      previewable: false,
      linkedPages: [],
      updatedAt: new Date().toISOString(),
    });
  };

  return (
    <div className="ep-review-page" style={{ maxWidth: 1180, margin: '0 auto', padding: '24px 28px 70px' }}>
      {/* Fb-1 — the review screen rides the CS-4 editor chrome (card shell + sticky header/toolbar +
          editor-style aside) so it feels native to the app, not the standalone wireframe. */}
      <div className="ep-editor-card" style={{ background: 'var(--card)', border: '3px solid var(--ink)', borderRadius: 10, boxShadow: '6px 6px 0 var(--shadow)' }}>
        <div className="ep-editor-sticky">
          <ReviewHeader
            slug={slug}
            pageId={pageId}
            projectTitle={payload.project.title}
            pageTitle={payload.pageTitle}
            files={dessinFiles}
            selectedFile={selectedAssetId ?? ''}
            onSelectFile={onSelectFile}
            versions={sel?.versions ?? []}
            fromVersion={sel?.fromVersion ?? 0}
            toVersion={sel?.toVersion ?? 0}
            onFrom={onFrom}
            onTo={onTo}
            members={payload.members}
            allCorrige={allCorrige}
            onValidate={onValidate}
            validating={validating}
            validateError={validateError}
          />
        </div>

        <div className="ep-editor-body ep-review-layout" style={{ display: 'flex' }}>
          {/* Surface panel (editor main) — dessin-only (r4) */}
          <div
            ref={surfaceRef}
            className="ep-editor-main"
            style={{ flex: 1, minWidth: 0, padding: 18, background: 'var(--card)' }}
          >
            {!dessinSel ? (
              <div style={{ padding: 24, color: 'var(--ink2)', fontStyle: 'italic', fontSize: 14 }}>
                Aucun fichier dessin lié à cette carte.
              </div>
            ) : (
              <>
                {/* A5 — bring in the corrected art without leaving Révision: reuses the CS-3 presigned
                    upload → POST /assets/:id/versions (AssetVersionsModal). */}
                {selectedFile && (
                  <div style={{ marginBottom: 12 }}>
                    <button
                      type="button"
                      onClick={openVersionModal}
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        border: '3px solid var(--ink)',
                        borderRadius: 8,
                        padding: '8px 14px',
                        minHeight: 40,
                        background: 'var(--card)',
                        color: 'var(--ink)',
                        boxShadow: '3px 3px 0 var(--shadow)',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      ＋ Nouvelle version du dessin
                    </button>
                  </div>
                )}
                <DessinSurface
                  fromImageUrl={dessinSel.fromImageUrl}
                  toImageUrl={dessinSel.toImageUrl}
                  fromVersion={dessinSel.fromVersion}
                  toVersion={dessinSel.toVersion}
                  corrections={dessinCorrections}
                  numberOf={numberOf}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  draftRegion={draftRegion}
                  onDrawRegion={setDraftRegion}
                />
              </>
            )}
          </div>

          {/* Aside: unified list + (dessin) composer — styled like the editor sidebar */}
          <aside
            className="ep-editor-sidebar ep-review-aside"
            aria-label="Corrections"
            style={{ width: 320, flex: 'none', borderLeft: '3px solid var(--ink)', background: 'var(--paper)', display: 'flex', flexDirection: 'column' }}
          >
            <CorrectionList
              items={visible}
              numberOf={numberOf}
              meId={account.id}
              statusFilter={statusFilter}
              onStatusFilter={setStatusFilter}
              selectedId={selectedId}
              onSelect={(id) => setSelectedId((cur) => (cur === id ? null : id))}
              onStatusChange={changeStatus}
              onDelete={setConfirmDel}
              busyId={busyId}
              rowError={rowError}
              hasMore={payload.corrections.totalPages > morePage}
              onLoadMore={loadMore}
              loadingMore={loadingMore}
            />
            {dessinSel?.fromImageUrl && (
              <Composer
                draftRegion={draftRegion}
                onClearRegion={() => setDraftRegion(null)}
                onSubmit={createDessin}
                busy={composerBusy}
                error={composerError}
              />
            )}
          </aside>
        </div>
      </div>

      {confirmDel && (
        <ConfirmDialog
          title="Supprimer cette demande ?"
          confirmLabel="Supprimer"
          onConfirm={() => {
            const c = confirmDel;
            setConfirmDel(null);
            void doDelete(c);
          }}
          onCancel={() => setConfirmDel(null)}
        />
      )}

      {versionModal && (
        <AssetVersionsModal
          slug={slug}
          asset={versionModal}
          onClose={() => setVersionModal(null)}
          onUpdated={() => {
            // A5 — a new version bumped the head; refetch the review payload so the compare updates.
            setReloadKey((k) => k + 1);
          }}
        />
      )}

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 60, background: 'var(--ink)', color: 'var(--paper)', border: '2px solid var(--ink)', borderRadius: 8, padding: '10px 16px', fontSize: 13, fontWeight: 700, boxShadow: '4px 4px 0 var(--shadow)' }} role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </div>
  );
}
