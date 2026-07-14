'use client';

// CS-3 — "Importer dessins & textes" (replaces the CS-2 Fichiers placeholder). Replica of the
// prototype IMPORT section (data-page="import"): filter tabs, dashed drop zone + source options,
// "Importés récemment" grid — plus the induced additions (search/sort/card-filter bar, per-file
// version history, in-app preview). Uploads go through the F-10 presigned direct-to-storage flow.
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AssetItem,
  AssetListResponse,
  AssetSort,
  AssetType,
  WorkspacePage,
} from '@encre-et-plume/shared';
import {
  listProjectAssets,
  createProjectAsset,
  createProjectAssetFromUrl,
  deleteAsset,
} from '../../lib/api';
import { DRAWING_SOURCE_EXTENSIONS } from '@encre-et-plume/shared';
import { uploadAssetFile, validateAssetFile } from '../../lib/assetUpload';
import OnBrandSelect from '../form/OnBrandSelect';
import { DownloadIcon, EyeIcon, FileTextIcon, TrashIcon } from '../icons';
import LinkCardModal from './LinkCardModal';
import AssetVersionsModal from './AssetVersionsModal';
import AssetPreviewOverlay from './AssetPreviewOverlay';
import ConfirmDialog from './ConfirmDialog';

const TYPE_TABS: { label: string; type: AssetType | null }[] = [
  { label: 'Tout', type: null },
  { label: 'Dessins', type: 'dessin' },
  { label: 'Textes', type: 'texte' },
  { label: 'Scénarios', type: 'scenario' },
  { label: 'Pages', type: 'page' },
  { label: 'Références', type: 'ref' },
];

// Import "Type" selector — "Automatique" (empty) sends no type (server derives, D-H).
const IMPORT_TYPES: { label: string; value: AssetType | '' }[] = [
  { label: 'Automatique', value: '' },
  { label: 'Scénario', value: 'scenario' },
  { label: 'Dessin', value: 'dessin' },
  { label: 'Page', value: 'page' },
  { label: 'Référence', value: 'ref' },
  { label: 'Texte', value: 'texte' },
];

// Drop-zone `accept`: image/document MIME types + every drawing-source extension (kept in the shared
// allowlist so FE + BE agree). Extensions carry the drawing formats the browser reports no MIME for.
const ACCEPT_ATTR = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/avif',
  'application/pdf',
  'text/plain',
  '.docx',
  ...DRAWING_SOURCE_EXTENSIONS.map((e) => `.${e}`),
].join(',');

const TYPE_CHIP: Record<AssetType, string> = {
  dessin: 'Dessin',
  texte: 'Texte',
  scenario: 'Scénario',
  ref: 'Référence',
  page: 'Page',
};

// French file size, SI units to match the prototype ("2,4 Mo", "48 Ko").
function formatBytesFr(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1).replace('.', ',')} Mo`;
  if (bytes >= 1_000) return `${Math.round(bytes / 1_000)} Ko`;
  return `${bytes} o`;
}

type UploadRow = {
  id: string;
  file: File;
  name: string;
  status: 'uploading' | 'processing' | 'error';
  progress: number;
  message?: string;
};

export interface FichiersPanelProps {
  slug: string;
  pages: WorkspacePage[];
  // Non-members viewing a public project get a read-only view: grid + search/filter + preview stay,
  // but every write affordance (import, drop zone, link-to-card, new version) is hidden. Mirrors the
  // Tableau/Infos panels; every write is member-gated server-side too.
  readOnly?: boolean;
}

export default function FichiersPanel({ slug, pages, readOnly = false }: FichiersPanelProps) {
  const [data, setData] = useState<AssetListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);

  // Filters
  const [type, setType] = useState<AssetType | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [sort, setSort] = useState<AssetSort>('recent');
  const [pageId, setPageId] = useState<string>('');
  const [page, setPage] = useState(1);
  const [refreshKey, setRefreshKey] = useState(0);

  // Upload + URL import
  const [uploads, setUploads] = useState<UploadRow[]>([]);
  const [importType, setImportType] = useState<AssetType | ''>('');
  const [dragOver, setDragOver] = useState(false);
  const [urlOpen, setUrlOpen] = useState(false);
  const [urlValue, setUrlValue] = useState('');
  const [urlError, setUrlError] = useState<string | null>(null);
  const [urlBusy, setUrlBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLButtonElement>(null);

  // Modals
  const [linkTarget, setLinkTarget] = useState<AssetItem | null>(null);
  const [versionsTarget, setVersionsTarget] = useState<AssetItem | null>(null);
  const [previewTarget, setPreviewTarget] = useState<AssetItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AssetItem | null>(null);

  const hasFilters = type !== null || !!pageId || search.trim() !== '' || sort !== 'recent';

  // Debounce the filename search (auto-apply, no button).
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFetchError(false);
    const query = {
      ...(type ? { type } : {}),
      ...(pageId ? { pageId } : {}),
      ...(debouncedQ ? { q: debouncedQ } : {}),
      ...(sort !== 'recent' ? { sort } : {}),
      ...(page > 1 ? { page } : {}),
    };
    listProjectAssets(slug, query)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        if (!cancelled) setFetchError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug, type, pageId, debouncedQ, sort, page, refreshKey]);

  function selectType(next: AssetType | null) {
    setType(next);
    setPage(1);
  }

  function resetFilters() {
    setType(null);
    setSearch('');
    setDebouncedQ('');
    setSort('recent');
    setPageId('');
    setPage(1);
  }

  // ── Upload pipeline ────────────────────────────────────────────────────────
  const runUpload = useCallback(
    async (rowId: string, file: File) => {
      setUploads((rows) =>
        rows.map((r) => (r.id === rowId ? { ...r, status: 'uploading', progress: 0, message: undefined } : r)),
      );
      try {
        const mediaId = await uploadAssetFile(file, (progress) =>
          setUploads((rows) => rows.map((r) => (r.id === rowId ? { ...r, progress } : r))),
        );
        setUploads((rows) => rows.map((r) => (r.id === rowId ? { ...r, status: 'processing' } : r)));
        await createProjectAsset(slug, { mediaId, filename: file.name, ...(importType ? { type: importType } : {}) });
        setUploads((rows) => rows.filter((r) => r.id !== rowId));
        refresh();
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Échec de l’import. Réessayez.';
        setUploads((rows) => rows.map((r) => (r.id === rowId ? { ...r, status: 'error', message } : r)));
      }
    },
    [slug, refresh, importType],
  );

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const list = Array.from(files);
      for (const file of list) {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const invalid = validateAssetFile(file);
        if (invalid) {
          setUploads((rows) => [...rows, { id, file, name: file.name, status: 'error', progress: 0, message: invalid }]);
          continue;
        }
        setUploads((rows) => [...rows, { id, file, name: file.name, status: 'uploading', progress: 0 }]);
        void runUpload(id, file);
      }
    },
    [runUpload],
  );

  function retryUpload(row: UploadRow) {
    const invalid = validateAssetFile(row.file);
    if (invalid) {
      setUploads((rows) => rows.map((r) => (r.id === row.id ? { ...r, status: 'error', message: invalid } : r)));
      return;
    }
    void runUpload(row.id, row.file);
  }

  function dismissUpload(id: string) {
    setUploads((rows) => rows.filter((r) => r.id !== id));
  }

  async function submitUrl(e: React.FormEvent) {
    e.preventDefault();
    const url = urlValue.trim();
    if (!url) return;
    setUrlBusy(true);
    setUrlError(null);
    try {
      await createProjectAssetFromUrl(slug, { url, ...(importType ? { type: importType } : {}) });
      setUrlValue('');
      setUrlOpen(false);
      refresh();
    } catch (err) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as { message: unknown }).message) : null;
      setUrlError(msg ?? 'Échec de l’import. Réessayez.');
    } finally {
      setUrlBusy(false);
    }
  }

  function onAssetUpdated(updated: AssetItem) {
    setData((d) => (d ? { ...d, items: d.items.map((it) => (it.id === updated.id ? updated : it)) } : d));
  }

  const [deleteError, setDeleteError] = useState<string | null>(null);
  async function confirmDeleteAsset() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    setDeleteError(null);
    try {
      await deleteAsset(target.id);
      setDeleteTarget(null);
      refresh();
    } catch (e) {
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : null;
      setDeleteError(msg ?? 'Échec de la suppression. Réessayez.');
    }
  }

  const items = data?.items ?? [];
  const showEmpty = !loading && !fetchError && items.length === 0;

  return (
    <div style={{ padding: '20px 22px 40px', maxWidth: 1024, margin: '0 auto' }}>
      <h1 style={{ fontSize: 30, textTransform: 'uppercase', margin: '0 0 4px', fontFamily: 'var(--font-display)' }}>
        Importer dessins &amp; textes
      </h1>
      <p style={{ fontSize: 14, color: 'var(--ink2)', fontWeight: 500, margin: '0 0 16px' }}>
        Déposez vos fichiers puis liez-les aux cartes du tableau de production.
      </p>

      {/* Filter tabs */}
      <div role="group" aria-label="Filtrer par type" style={tabRow}>
        {TYPE_TABS.map((t) => {
          const active = t.type === type;
          return (
            <button
              key={t.label}
              type="button"
              aria-pressed={active}
              onClick={() => selectType(t.type)}
              style={{
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontSize: 14,
                fontWeight: 700,
                color: active ? 'var(--ink)' : 'var(--ink2)',
                borderBottom: active ? '3px solid var(--accent)' : '3px solid transparent',
                padding: '0 0 6px',
                minHeight: 30,
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Search / sort / card-filter bar */}
      <div style={filterBar}>
        <input
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Rechercher un fichier…"
          aria-label="Rechercher un fichier"
          style={searchInput}
        />
        <div style={{ minWidth: 150 }}>
          <OnBrandSelect
            aria-label="Trier les fichiers"
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as AssetSort);
              setPage(1);
            }}
          >
            <option value="recent">Récents</option>
            <option value="name">Nom A–Z</option>
            <option value="size">Taille</option>
          </OnBrandSelect>
        </div>
        <div style={{ minWidth: 180 }}>
          <OnBrandSelect
            aria-label="Filtrer par carte"
            value={pageId}
            onChange={(e) => {
              setPageId(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Toutes les cartes</option>
            {pages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </OnBrandSelect>
        </div>
        {hasFilters && (
          <button type="button" onClick={resetFilters} style={resetBtn}>
            Réinitialiser
          </button>
        )}
        {!readOnly && (
          <button type="button" onClick={() => fileInputRef.current?.click()} style={importBtn}>
            ＋ Importer
          </button>
        )}
      </div>

      {!readOnly && (
        <>
      {/* Hidden multi-file input (opened by the drop zone / Parcourir / ＋ Importer) */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ACCEPT_ATTR}
        aria-label="Importer des fichiers"
        onChange={(e) => {
          if (e.target.files?.length) addFiles(e.target.files);
          e.target.value = '';
        }}
        style={{ display: 'none' }}
      />

      {/* Dashed drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
        }}
        style={{
          border: `3px dashed ${dragOver ? 'var(--accent)' : 'var(--ink)'}`,
          borderRadius: 12,
          background: dragOver ? 'var(--accent-soft)' : 'var(--card)',
          padding: '28px 20px',
          textAlign: 'center',
          marginBottom: 20,
          transition: 'border-color .1s, background .1s',
        }}
      >
        <button
          ref={dropRef}
          type="button"
          onClick={() => fileInputRef.current?.click()}
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--ink)', fontFamily: 'inherit', display: 'block', margin: '0 auto' }}
        >
          <DownloadIcon size={30} style={{ display: 'block', margin: '0 auto' }} />
          <span style={{ display: 'block', fontFamily: 'var(--font-display)', fontSize: 24, textTransform: 'uppercase', marginTop: 6 }}>
            Glissez vos fichiers ici
          </span>
          <span style={{ display: 'block', fontSize: 13, color: 'var(--ink2)', fontWeight: 500, margin: '4px 0 0' }}>
            images (.png .jpg) · dessin (.psd .clip .kra .procreate …) · textes (.txt .docx) · scénarios
          </span>
        </button>
        <div style={{ display: 'flex', gap: 9, justifyContent: 'center', flexWrap: 'wrap', marginTop: 14 }}>
          <button type="button" onClick={() => fileInputRef.current?.click()} style={sourcePrimary}>
            Parcourir…
          </button>
          <button type="button" aria-disabled disabled title="Bientôt disponible" style={sourceDisabled}>
            Tablette
          </button>
          <button type="button" onClick={() => setUrlOpen((v) => !v)} aria-expanded={urlOpen} style={sourceSecondary}>
            Lien · URL
          </button>
          <button type="button" aria-disabled disabled title="Bientôt disponible" style={sourceDisabled}>
            Cloud
          </button>
        </div>
        {/* F6 — optional declared type; "Automatique" lets the server derive it. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginTop: 12 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)' }}>Type</span>
          <div style={{ minWidth: 170, textAlign: 'left' }}>
            <OnBrandSelect
              aria-label="Type de fichier"
              value={importType}
              onChange={(e) => setImportType(e.target.value as AssetType | '')}
            >
              {IMPORT_TYPES.map((t) => (
                <option key={t.label} value={t.value}>
                  {t.label}
                </option>
              ))}
            </OnBrandSelect>
          </div>
        </div>
        {urlOpen && (
          <form onSubmit={submitUrl} style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginTop: 12 }}>
            <input
              type="url"
              value={urlValue}
              onChange={(e) => setUrlValue(e.target.value)}
              placeholder="https://…"
              aria-label="Adresse du fichier à importer"
              required
              style={{ ...searchInput, minWidth: 240, flex: '1 1 240px', maxWidth: 420 }}
            />
            <button type="submit" disabled={urlBusy} style={sourcePrimary}>
              {urlBusy ? 'Import…' : 'Importer'}
            </button>
          </form>
        )}
        {urlError && (
          <div role="alert" style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700, marginTop: 8 }}>
            {urlError}
          </div>
        )}
      </div>

      {/* Per-file upload rows */}
      {uploads.length > 0 && (
        <ul style={{ listStyle: 'none', margin: '0 0 20px', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {uploads.map((u) => (
            <li key={u.id} style={uploadRow}>
              <span style={{ fontSize: 13, fontWeight: 700, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {u.name}
              </span>
              {u.status === 'uploading' && (
                <span role="progressbar" aria-valuenow={u.progress} aria-valuemin={0} aria-valuemax={100} style={{ fontSize: 12, color: 'var(--ink2)', fontWeight: 700 }}>
                  {u.progress}%
                </span>
              )}
              {u.status === 'processing' && (
                <span style={{ fontSize: 12, color: 'var(--ink2)', fontWeight: 700 }}>Optimisation…</span>
              )}
              {u.status === 'error' && (
                <>
                  <span role="alert" style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 700 }}>{u.message}</span>
                  <button type="button" onClick={() => retryUpload(u)} style={smallBtn}>
                    Réessayer
                  </button>
                  <button type="button" onClick={() => dismissUpload(u.id)} aria-label={`Retirer ${u.name}`} style={smallBtn}>
                    Retirer
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
        </>
      )}

      {/* Recent grid */}
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, textTransform: 'uppercase', marginBottom: 12 }}>
        Importés récemment
      </div>

      {fetchError ? (
        <div style={{ fontSize: 14, color: 'var(--ink2)' }}>
          Impossible de charger les fichiers.{' '}
          <button type="button" onClick={refresh} style={linkBtn}>
            Réessayer
          </button>
        </div>
      ) : loading && !data ? (
        <div style={{ fontSize: 14, color: 'var(--ink2)' }}>Chargement…</div>
      ) : showEmpty ? (
        <div style={{ fontSize: 14, color: 'var(--ink2)' }}>
          {hasFilters ? 'Aucun fichier ne correspond' : 'Aucun fichier importé'}
        </div>
      ) : (
        <>
          <div style={grid}>
            {items.map((a) => (
              <AssetCard
                key={a.id}
                asset={a}
                readOnly={readOnly}
                onPreview={() => setPreviewTarget(a)}
                onLink={() => setLinkTarget(a)}
                onVersions={() => setVersionsTarget(a)}
                onDelete={() => {
                  setDeleteError(null);
                  setDeleteTarget(a);
                }}
              />
            ))}
          </div>
          {data && data.totalPages > 1 && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center', marginTop: 20 }}>
              <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} style={smallBtn}>
                ‹ Précédent
              </button>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink2)' }}>
                Page {data.page} / {data.totalPages}
              </span>
              <button type="button" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)} style={smallBtn}>
                Suivant ›
              </button>
            </div>
          )}
        </>
      )}

      {linkTarget && (
        <LinkCardModal
          asset={linkTarget}
          pages={pages}
          onClose={() => setLinkTarget(null)}
          onLinked={(updated) => {
            onAssetUpdated(updated);
            setLinkTarget(null);
          }}
        />
      )}
      {versionsTarget && (
        <AssetVersionsModal
          slug={slug}
          asset={versionsTarget}
          readOnly={readOnly}
          onClose={() => setVersionsTarget(null)}
          onUpdated={(updated) => {
            onAssetUpdated(updated);
            setVersionsTarget(updated);
            refresh();
          }}
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
      {deleteTarget && (
        <ConfirmDialog
          title="Supprimer le fichier ?"
          message={
            deleteError
              ? deleteError
              : `« ${deleteTarget.filename} » et tout son historique de versions seront supprimés.`
          }
          confirmLabel="Supprimer"
          onConfirm={() => void confirmDeleteAsset()}
          onCancel={() => {
            setDeleteTarget(null);
            setDeleteError(null);
          }}
        />
      )}
    </div>
  );
}

function AssetCard({
  asset,
  readOnly,
  onPreview,
  onLink,
  onVersions,
  onDelete,
}: {
  asset: AssetItem;
  readOnly: boolean;
  onPreview: () => void;
  onLink: () => void;
  onVersions: () => void;
  onDelete: () => void;
}) {
  return (
    <div data-asset-card style={card}>
      <div style={thumbBand}>
        {asset.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={asset.thumbnailUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <FileTextIcon size={30} style={{ color: 'var(--ink2)' }} />
        )}
      </div>
      {/* Flex column so the action row can pin to the card bottom (marginTop:auto) — cards in a grid
          row share the same height (CSS grid stretch), so their buttons line up. */}
      <div style={{ padding: 9, flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {asset.filename}
        </div>
        <div style={{ fontSize: 11, color: 'var(--ink2)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span>
            {TYPE_CHIP[asset.type]} · {formatBytesFr(asset.size)}
          </span>
          <button type="button" onClick={onVersions} aria-label={`Historique des versions de ${asset.filename}`} style={versionBadgeBtn}>
            v{asset.currentVersion}
          </button>
        </div>
        {asset.linkedPages.length === 1 ? (
          <div style={linkedChip} title={`Liée à ${asset.linkedPages[0].title}`}>
            {asset.linkedPages[0].title}
          </div>
        ) : asset.linkedPages.length > 1 ? (
          <div style={linkedChip} title={asset.linkedPages.map((p) => p.title).join(' · ')}>
            Liée à {asset.linkedPages.length} cartes
          </div>
        ) : null}
        {/* Bottom-pinned real on-brand buttons, equal height, ≥44px effective tap target. */}
        <div style={{ display: 'flex', gap: 6, marginTop: 'auto', paddingTop: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={onPreview}
            disabled={!asset.previewable}
            style={{ ...cardActionBtn, opacity: asset.previewable ? 1 : 0.5 }}
            aria-label={`Aperçu de ${asset.filename}`}
          >
            <EyeIcon size={13} /> Aperçu
          </button>
          {!readOnly && (
            <>
              <button type="button" onClick={onLink} aria-label={`Lier ${asset.filename} à une carte`} style={cardActionBtn}>
                ＋ Lier à une carte
              </button>
              <button
                type="button"
                onClick={onDelete}
                aria-label={`Supprimer ${asset.filename}`}
                style={{ ...cardActionBtn, color: '#c0392b', borderColor: '#c0392b' }}
              >
                <TrashIcon size={13} /> Supprimer
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── styles ─────────────────────────────────────────────────────────────────────
const tabRow: React.CSSProperties = {
  display: 'flex',
  gap: 16,
  alignItems: 'center',
  marginBottom: 14,
  flexWrap: 'wrap',
  borderBottom: '2px solid var(--border)',
  paddingBottom: 2,
};

const filterBar: React.CSSProperties = {
  display: 'flex',
  gap: 10,
  alignItems: 'center',
  flexWrap: 'wrap',
  marginBottom: 18,
};

const searchInput: React.CSSProperties = {
  flex: '1 1 220px',
  minWidth: 180,
  minHeight: 44,
  boxSizing: 'border-box',
  border: '2px solid var(--ink)',
  borderRadius: 8,
  padding: '8px 12px',
  fontSize: 14,
  fontFamily: 'inherit',
  background: 'var(--card)',
  color: 'var(--ink)',
};

const importBtn: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  background: 'var(--accent)',
  color: '#fff',
  border: '2px solid var(--ink)',
  borderRadius: 6,
  padding: '9px 16px',
  cursor: 'pointer',
  boxShadow: '2px 2px 0 var(--shadow)',
  fontFamily: 'inherit',
  minHeight: 44,
};

const resetBtn: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  border: '2px solid var(--ink)',
  borderRadius: 6,
  padding: '8px 14px',
  cursor: 'pointer',
  background: 'var(--card)',
  color: 'var(--ink)',
  fontFamily: 'inherit',
  minHeight: 44,
};

const sourcePrimary: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  background: 'var(--accent)',
  color: '#fff',
  border: '2px solid var(--ink)',
  borderRadius: 6,
  padding: '9px 16px',
  cursor: 'pointer',
  boxShadow: '2px 2px 0 var(--shadow)',
  fontFamily: 'inherit',
  minHeight: 44,
};

const sourceSecondary: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  background: 'var(--card)',
  color: 'var(--ink)',
  border: '2px solid var(--ink)',
  borderRadius: 6,
  padding: '9px 16px',
  cursor: 'pointer',
  fontFamily: 'inherit',
  minHeight: 44,
};

const sourceDisabled: React.CSSProperties = {
  ...sourceSecondary,
  color: 'var(--ink2)',
  cursor: 'not-allowed',
  opacity: 0.6,
};

const grid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
  gap: 16,
};

const card: React.CSSProperties = {
  background: 'var(--card)',
  border: '3px solid var(--ink)',
  borderRadius: 8,
  overflow: 'hidden',
  boxShadow: '4px 4px 0 var(--shadow)',
  display: 'flex',
  flexDirection: 'column',
};

const thumbBand: React.CSSProperties = {
  height: 96,
  borderBottom: '3px solid var(--ink)',
  background: 'var(--paper)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
};

const versionBadgeBtn: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  fontFamily: 'var(--font-mono, monospace)',
  border: '1.5px solid var(--ink)',
  borderRadius: 4,
  padding: '0 6px',
  background: 'var(--card)',
  color: '#000',
  cursor: 'pointer',
  minHeight: 20,
};

const linkedChip: React.CSSProperties = {
  display: 'inline-block',
  maxWidth: '100%',
  marginTop: 6,
  fontSize: 10,
  fontWeight: 700,
  border: '1.5px solid var(--ink)',
  borderRadius: 4,
  padding: '1px 7px',
  background: 'var(--accent-soft)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  boxSizing: 'border-box',
};

// F10 — real on-brand grid-card action button, bottom-pinned, equal height across cards.
const cardActionBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 4,
  flex: '1 1 auto',
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--ink)',
  background: 'var(--card)',
  border: '2px solid var(--ink)',
  borderRadius: 6,
  cursor: 'pointer',
  fontFamily: 'inherit',
  padding: '6px 8px',
  minHeight: 36,
};

const uploadRow: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  border: '2px solid var(--ink)',
  borderRadius: 8,
  padding: '9px 12px',
  background: 'var(--card)',
  flexWrap: 'wrap',
};

const smallBtn: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  border: '2px solid var(--ink)',
  borderRadius: 6,
  padding: '6px 12px',
  cursor: 'pointer',
  background: 'var(--card)',
  color: 'var(--ink)',
  fontFamily: 'inherit',
  minHeight: 36,
};

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
