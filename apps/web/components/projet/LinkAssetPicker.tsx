'use client';

// CS-2 (post-CS-3) — type-scoped "＋ Lier un fichier" / "Lier · remplacer" picker for the card modal's
// per-type FICHIERS sections. Inverts CS-3's "Lier à une carte" modal (LinkCardModal chrome) into an
// asset picker scoped to one section's asset type(s): lists this project's assets of those types,
// debounced filename search, and links the picked asset to THIS card via POST /assets/:id/link
// (CS-3's re-link = "one card max per asset; re-link replaces" — the "remplacer" semantics, D-C).
import { useEffect, useMemo, useRef, useState } from 'react';
import { useScrollLock } from '../../lib/useScrollLock';
import type { AssetItem, AssetType } from '@encre-et-plume/shared';
import { listProjectAssets, linkAssetToPage } from '../../lib/api';
import { XIcon } from '../icons';

export interface LinkAssetPickerProps {
  slug: string;
  pageId: string;
  /** The section's asset type(s) — an asset already of one of these keeps its type on link. */
  types: AssetType[];
  /** The section's canonical type — assigned to an out-of-section asset when picked (D-H/D-I). */
  canonicalType: AssetType;
  sectionLabel: string;
  onClose: () => void;
  onLinked: (asset: AssetItem) => void;
}

const dateFr = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

const TYPE_LABEL: Record<AssetType, string> = {
  dessin: 'Dessin',
  texte: 'Texte',
  scenario: 'Scénario',
  ref: 'Référence',
  page: 'Page',
};

export default function LinkAssetPicker({ slug, pageId, types, canonicalType, sectionLabel, onClose, onLinked }: LinkAssetPickerProps) {
  useScrollLock();
  const [assets, setAssets] = useState<AssetItem[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useRef(`link-asset-${Math.random().toString(36).slice(2)}`).current;

  // Debounce the filename search (auto-apply, no "Appliquer" button — filter-UI rule).
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  // One fetch of ALL project assets (the section no longer restricts what can be linked — an
  // out-of-section asset is reclassified to the section's canonical type on pick, D-H(b)).
  useEffect(() => {
    let alive = true;
    setLoadError(false);
    setAssets(null);
    listProjectAssets(slug, { ...(debouncedQ ? { q: debouncedQ } : {}) })
      .then((res) => {
        if (alive) setAssets(res.items);
      })
      .catch(() => {
        if (alive) setLoadError(true);
      });
    return () => {
      alive = false;
    };
  }, [slug, debouncedQ]);

  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  const sorted = useMemo(
    () => (assets ? [...assets].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) : null),
    [assets],
  );

  async function pick(asset: AssetItem) {
    setBusyId(asset.id);
    setLinkError(null);
    // Reclassify only when the asset's type isn't already valid for this section (D-I).
    const reclassify = !types.includes(asset.type);
    try {
      const updated = await linkAssetToPage(asset.id, {
        pageId,
        ...(reclassify ? { type: canonicalType } : {}),
      });
      onLinked(updated);
    } catch (e) {
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : null;
      setLinkError(msg ?? 'Échec de la liaison. Réessayez.');
      setBusyId(null);
    }
  }

  return (
    <div
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={overlay}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation();
            onClose();
          }
        }}
        style={panel}
      >
        <div style={header}>
          <div id={titleId} style={{ fontFamily: 'var(--font-display)', fontSize: 20, textTransform: 'uppercase' }}>
            Lier · remplacer
          </div>
          <span style={{ fontSize: 12, color: 'var(--ink2)', fontWeight: 700, marginLeft: 8 }}>{sectionLabel}</span>
          <button ref={closeRef} type="button" aria-label="Fermer" onClick={onClose} style={closeBtn}>
            <XIcon size={18} />
          </button>
        </div>

        <div style={{ flex: '1 1 auto', minHeight: 0, padding: 16, display: 'flex', flexDirection: 'column' }}>
          <input
            type="search"
            aria-label="Rechercher un fichier"
            placeholder="Rechercher un fichier…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={searchInput}
          />

          {linkError && (
            <div role="alert" style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700, margin: '10px 0 0' }}>
              {linkError}
            </div>
          )}

          <div style={{ marginTop: 12, flex: '1 1 auto', minHeight: 0, overflowY: 'auto' }}>
            {loadError ? (
              <div style={{ fontSize: 14, color: 'var(--ink2)' }}>Impossible de charger les fichiers.</div>
            ) : sorted === null ? (
              <div style={{ fontSize: 14, color: 'var(--ink2)' }}>Chargement…</div>
            ) : sorted.length === 0 ? (
              <div style={{ fontSize: 14, color: 'var(--ink2)' }}>
                Aucun fichier — importez-le depuis l’onglet Fichiers.
              </div>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {sorted.map((a) => {
                  const elsewhere = a.linkedPage && a.linkedPage.id !== pageId;
                  const reclassify = !types.includes(a.type);
                  return (
                    <li key={a.id}>
                      <button
                        type="button"
                        onClick={() => void pick(a)}
                        disabled={busyId !== null}
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          textAlign: 'left',
                          border: '2px solid var(--ink)',
                          borderRadius: 8,
                          background: 'var(--card)',
                          color: 'var(--ink)',
                          fontFamily: 'inherit',
                          padding: '10px 12px',
                          cursor: busyId ? 'default' : 'pointer',
                          minHeight: 44,
                        }}
                      >
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {a.filename}
                            </span>
                            <span style={typeChip}>{TYPE_LABEL[a.type]}</span>
                          </span>
                          {reclassify && (
                            <span style={{ display: 'block', fontSize: 11, color: 'var(--accent)', fontWeight: 700, marginTop: 2 }}>
                              sera reclassé « {TYPE_LABEL[canonicalType]} »
                            </span>
                          )}
                          {elsewhere && (
                            <span style={{ display: 'block', fontSize: 11, color: 'var(--accent)', fontWeight: 700, marginTop: 2 }}>
                              liée à « {a.linkedPage!.title} » — sera re-liée
                            </span>
                          )}
                        </span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)', flex: 'none' }}>
                          v{a.currentVersion} · {dateFr(a.updatedAt)}
                        </span>
                        {busyId === a.id && <span style={{ fontSize: 12, color: 'var(--ink2)' }}>…</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Jump straight to importing a brand-new file into this project. */}
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '2px solid var(--border)', fontSize: 13, color: 'var(--ink2)', fontWeight: 700 }}>
            Besoin d’un nouveau fichier ?{' '}
            <a href={`/projet/${encodeURIComponent(slug)}?tab=fichiers`} style={importLink}>
              Importer depuis Fichiers →
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 90,
  background: 'rgba(22,19,15,.55)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
};

const panel: React.CSSProperties = {
  width: 460,
  maxWidth: '100%',
  maxHeight: '88vh',
  background: 'var(--card)',
  border: '3px solid var(--ink)',
  borderRadius: 12,
  boxShadow: '7px 7px 0 var(--shadow)',
  overflow: 'hidden',
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
};

const header: React.CSSProperties = {
  flex: 'none',
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '15px 18px',
  borderBottom: '3px solid var(--ink)',
};

const searchInput: React.CSSProperties = {
  width: '100%',
  border: '2px solid var(--ink)',
  borderRadius: 8,
  padding: '9px 12px',
  fontSize: 14,
  fontFamily: 'inherit',
  background: 'var(--card)',
  color: 'var(--ink)',
  boxSizing: 'border-box',
  minHeight: 44,
};

const closeBtn: React.CSSProperties = {
  marginLeft: 'auto',
  border: 'none',
  background: 'transparent',
  color: 'var(--ink2)',
  cursor: 'pointer',
  display: 'inline-flex',
  padding: 4,
};

const importLink: React.CSSProperties = {
  color: 'var(--accent)',
  fontWeight: 700,
  textDecoration: 'underline',
};

const typeChip: React.CSSProperties = {
  flex: 'none',
  fontSize: 10,
  fontWeight: 700,
  border: '1.5px solid var(--ink)',
  borderRadius: 4,
  padding: '1px 6px',
  background: 'var(--paper)',
  color: 'var(--ink2)',
  whiteSpace: 'nowrap',
};
