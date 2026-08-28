'use client';

// CS-20 — « Passation du scénario ». The quiet, NON-BLOCKING marker a card carries when the scenario
// it was handed off against has moved on, plus the one action that answers it. Shared by the board
// card face and the card modal's FICHIERS row so both surfaces say the same thing.
//
// It deliberately owns the whole affordance (marker → compare → acknowledge) instead of exporting a
// bare row: two call sites, one behaviour. The comparison itself is the EXISTING CS-5 modal — both
// panes still come from `GET /pages/:id/review` (server `sanitizeScenarioHtml`); nothing here ever
// touches live editor HTML.
import { useState } from 'react';
import type { PageHandoff, WorkspacePage, AssetVersionItem } from '@encre-et-plume/shared';
import { WarningIcon } from '../icons';
import { acknowledgeHandoff, getAssetVersions } from '../../lib/api';
import CompareVersionsModal from '../editeur/CompareVersionsModal';

export interface HandoffBannerProps {
  pageId: string;
  handoff: PageHandoff | null;
  /** The viewer holds « Écriture » — only then is « J'ai pris connaissance » offered. The marker
   *  itself is information and is shown to every member. */
  canWrite: boolean;
  onAcknowledged: (page: WorkspacePage) => void;
  /** The card modal states the pin even when it is current (« dessiné d'après v5 »); the board card
   *  face stays silent until it goes stale. */
  showCurrent?: boolean;
}

export default function HandoffBanner({ pageId, handoff, canWrite, onAcknowledged, showCurrent = false }: HandoffBannerProps) {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<Pick<AssetVersionItem, 'version' | 'note'>[]>([]);

  if (!handoff) return null;

  if (!handoff.stale) {
    // F5 — legible BEFORE it goes stale, so the state is never a surprise.
    return showCurrent ? <span style={currentLabel}>dessiné d’après v{handoff.version}</span> : null;
  }

  return (
    // The board card is itself a `role="button"`, and the compare modal is portalled but still a
    // React child here — synthetic clicks would bubble straight into "open the card". Contain them.
    <span
      style={{ display: 'contents' }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="ep-handoff-marker"
        title="Comparer les versions"
        onClick={() => {
          setOpen(true);
          // Best-effort: the modal falls back to the pinned/head pair if this never lands.
          void getAssetVersions(handoff.assetId)
            .then(setVersions)
            .catch(() => undefined);
        }}
        style={marker}
      >
        {/* The icon rides INSIDE the label so the row wraps as [icon + text] / [pair] instead of
            breaking after the icon on a narrow card. */}
        <span style={{ minWidth: 0 }}>
          <WarningIcon size={12} style={{ display: 'inline', verticalAlign: -2, marginRight: 4 }} />
          Le scénario a changé depuis la passation
        </span>
        <span style={pair}>
          v{handoff.version} → v{handoff.headVersion}
        </span>
      </button>

      {open && (
        <CompareVersionsModal
          pageId={pageId}
          assetId={handoff.assetId}
          versions={versions}
          headVersion={handoff.headVersion}
          initialFrom={handoff.version}
          onClose={() => setOpen(false)}
          onAcknowledge={
            canWrite
              ? async () => {
                  onAcknowledged(await acknowledgeHandoff(pageId));
                }
              : undefined
          }
        />
      )}
    </span>
  );
}

// A text affordance, not a CTA: no `.ep-btn-*` fill. Colour + hover live in `.ep-handoff-marker`
// (globals.css) — an inline `color` would out-rank the class and kill the hover, as it did for the
// card menu (R7-3). `flexWrap` is what keeps it wrapping UNDER the title at 375px instead of
// widening the card.
const marker: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  flexWrap: 'wrap',
  marginTop: 6,
  width: '100%',
  border: 'none',
  background: 'transparent',
  padding: '4px 0',
  minHeight: 30,
  fontSize: 11,
  fontWeight: 700,
  fontFamily: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
};

const pair: React.CSSProperties = {
  border: '1.5px solid currentColor',
  borderRadius: 4,
  padding: '0 5px',
  whiteSpace: 'nowrap',
};

const currentLabel: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--ink2)',
};
