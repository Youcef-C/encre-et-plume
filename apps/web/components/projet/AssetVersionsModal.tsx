'use client';

// CS-3 F6 — per-file version history (2026-07-13). An asset is a versioned file; this lists v1…vN
// (desc) with note + date + author, and appends a new version through the same F-10 upload pipeline
// (re-import never spawns a second asset). Proto modal chrome, Escape-dismissible.
import { useEffect, useRef, useState } from 'react';
import type { AssetItem, AssetVersionItem } from '@encre-et-plume/shared';
import { getAssetVersions, addAssetVersion } from '../../lib/api';
import { uploadAssetFile, validateAssetFile } from '../../lib/assetUpload';
import { XIcon } from '../icons';

export interface AssetVersionsModalProps {
  slug: string;
  asset: AssetItem;
  // Read-only viewers (non-members) see the version history but cannot add a new version.
  readOnly?: boolean;
  onClose: () => void;
  onUpdated: (updated: AssetItem) => void;
}

const dateFr = (iso: string) =>
  new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

type UploadPhase =
  | { kind: 'idle' }
  | { kind: 'uploading'; progress: number }
  | { kind: 'saving' }
  | { kind: 'error'; message: string };

export default function AssetVersionsModal({ slug, asset, readOnly = false, onClose, onUpdated }: AssetVersionsModalProps) {
  const [versions, setVersions] = useState<AssetVersionItem[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [note, setNote] = useState('');
  const [phase, setPhase] = useState<UploadPhase>({ kind: 'idle' });
  const inputRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useRef(`versions-${Math.random().toString(36).slice(2)}`).current;

  function loadVersions() {
    setLoadError(false);
    getAssetVersions(asset.id)
      .then(setVersions)
      .catch(() => setLoadError(true));
  }

  useEffect(() => {
    loadVersions();
    closeRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset.id]);

  async function onPick(file: File) {
    const invalid = validateAssetFile(file);
    if (invalid) {
      setPhase({ kind: 'error', message: invalid });
      return;
    }
    setPhase({ kind: 'uploading', progress: 0 });
    try {
      const mediaId = await uploadAssetFile(file, (progress) => setPhase({ kind: 'uploading', progress }));
      setPhase({ kind: 'saving' });
      const updated = await addAssetVersion(slug, asset.id, {
        mediaId,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      onUpdated(updated);
      setNote('');
      setPhase({ kind: 'idle' });
      loadVersions();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Échec de l’import. Réessayez.';
      setPhase({ kind: 'error', message: msg });
    }
  }

  const busy = phase.kind === 'uploading' || phase.kind === 'saving';

  return (
    <div onMouseDown={(e) => e.target === e.currentTarget && onClose()} style={overlay}>
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
            Versions
          </div>
          <span style={{ fontSize: 12, color: 'var(--ink2)', fontWeight: 700, marginLeft: 8, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {asset.filename}
          </span>
          <button ref={closeRef} type="button" aria-label="Fermer" onClick={onClose} style={closeBtn}>
            <XIcon size={18} />
          </button>
        </div>

        <div style={{ padding: 16, maxHeight: '52vh', overflowY: 'auto' }}>
          {loadError ? (
            <div style={{ fontSize: 14, color: 'var(--ink2)' }}>
              Impossible de charger les versions.{' '}
              <button type="button" onClick={loadVersions} style={linkBtn}>
                Réessayer
              </button>
            </div>
          ) : versions === null ? (
            <div style={{ fontSize: 14, color: 'var(--ink2)' }}>Chargement…</div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {versions.map((v) => (
                <li
                  key={v.version}
                  style={{ display: 'flex', gap: 10, border: '2px solid var(--ink)', borderRadius: 8, padding: '10px 12px' }}
                >
                  <span style={versionBadge}>v{v.version}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: 'var(--ink)' }}>{v.note || '—'}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink2)', fontWeight: 700, marginTop: 3 }}>
                      {v.authorName} · {dateFr(v.createdAt)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {!readOnly && (
        <div style={footer}>
          <label htmlFor={`${titleId}-note`} style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)' }}>
            NOTE (optionnelle)
          </label>
          <input
            id={`${titleId}-note`}
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Décrivez cette version…"
            disabled={busy}
            style={noteInput}
          />
          <input
            ref={inputRef}
            type="file"
            aria-label="Choisir un fichier pour la nouvelle version"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onPick(f);
              e.target.value = '';
            }}
            style={{ display: 'none' }}
          />
          {phase.kind === 'error' && (
            <div role="alert" style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700 }}>
              {phase.message}
            </div>
          )}
          {phase.kind === 'uploading' && (
            <div
              role="progressbar"
              aria-valuenow={phase.progress}
              aria-valuemin={0}
              aria-valuemax={100}
              style={{ fontSize: 12, color: 'var(--ink2)', fontWeight: 700 }}
            >
              Téléversement… {phase.progress}%
            </div>
          )}
          {phase.kind === 'saving' && (
            <div style={{ fontSize: 12, color: 'var(--ink2)', fontWeight: 700 }}>Enregistrement…</div>
          )}
          <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} style={primaryBtn}>
            ＋ Nouvelle version
          </button>
        </div>
        )}
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
  width: 480,
  maxWidth: '100%',
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
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  padding: '15px 18px',
  borderBottom: '3px solid var(--ink)',
};

const footer: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: '14px 18px',
  borderTop: '3px solid var(--ink)',
  background: 'var(--paper)',
};

const versionBadge: React.CSSProperties = {
  flex: 'none',
  alignSelf: 'flex-start',
  fontSize: 12,
  fontWeight: 700,
  fontFamily: 'var(--font-mono, monospace)',
  border: '2px solid var(--ink)',
  borderRadius: 5,
  padding: '2px 8px',
  background: 'var(--card)',
};

const noteInput: React.CSSProperties = {
  border: '2px solid var(--ink)',
  borderRadius: 8,
  background: 'var(--card)',
  color: 'var(--ink)',
  padding: '9px 12px',
  fontSize: 14,
  fontFamily: 'inherit',
  boxSizing: 'border-box',
  minHeight: 44,
};

const primaryBtn: React.CSSProperties = {
  alignSelf: 'flex-start',
  fontSize: 14,
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

const closeBtn: React.CSSProperties = {
  marginLeft: 'auto',
  border: 'none',
  background: 'transparent',
  color: 'var(--ink2)',
  cursor: 'pointer',
  display: 'inline-flex',
  padding: 4,
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
