'use client';

// CS-5 — "Demandes de correction" list (prototype aside, line 1669). r4: dessin-only (scenario
// corrections are managed in the editor as tagged comments), so the Toutes/Scénario/Dessin type filter
// and the type chip are gone; only the status OnBrandSelect remains (AUTO-APPLIED, no "Appliquer").
// Rows: number, author, zone ref, status, description, target version; a row highlights/scrolls to its
// box (row ↔ anchor two-way) and carries the status stepper + author delete.
import {
  CORRECTION_STATUS_LABELS,
  type CorrectionDto,
  type CorrectionStatus,
} from '@encre-et-plume/shared';
import OnBrandSelect from '../form/OnBrandSelect';
import { TrashIcon } from '../icons';
import { NEXT_STATUS, statusColor } from './shared';

type StatusFilter = '' | CorrectionStatus;

export interface CorrectionListProps {
  items: CorrectionDto[]; // already filtered for display
  numberOf: (id: string) => number;
  meId: string;
  statusFilter: StatusFilter;
  onStatusFilter: (s: StatusFilter) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onStatusChange: (c: CorrectionDto, status: CorrectionStatus) => void;
  onDelete: (c: CorrectionDto) => void;
  busyId: string | null;
  rowError: { id: string; message: string } | null;
  hasMore: boolean;
  onLoadMore: () => void;
  loadingMore: boolean;
}

function anchorRef(c: CorrectionDto): string {
  if (c.caseRef) return c.caseRef;
  if (c.type === 'dessin' && 'region' in c.anchor) {
    const r = c.anchor.region;
    return `zone ${Math.round(r.x * 100)},${Math.round(r.y * 100)}`;
  }
  return 'texte';
}

export default function CorrectionList({
  items,
  numberOf,
  meId,
  statusFilter,
  onStatusFilter,
  selectedId,
  onSelect,
  onStatusChange,
  onDelete,
  busyId,
  rowError,
  hasMore,
  onLoadMore,
  loadingMore,
}: CorrectionListProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{ padding: 14, borderBottom: '3px solid var(--ink)' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, textTransform: 'uppercase', marginBottom: 9 }}>
          Corrections
        </div>
        {/* Status filter — OnBrandSelect, auto-applied (r4: dessin-only list, status is the only filter) */}
        <div>
          <OnBrandSelect
            aria-label="Filtrer par statut"
            value={statusFilter}
            onChange={(e) => onStatusFilter(e.target.value as StatusFilter)}
          >
            <option value="">Tous les statuts</option>
            <option value="a_corriger">À corriger</option>
            <option value="en_cours">En cours</option>
            <option value="corrige">Corrigé</option>
          </OnBrandSelect>
        </div>
      </div>

      <ul
        style={{
          flex: 1,
          listStyle: 'none',
          margin: 0,
          padding: 14,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          overflow: 'auto',
        }}
      >
        {items.length === 0 && (
          <li style={{ fontSize: 13, color: 'var(--ink2)', fontStyle: 'italic' }}>Aucune demande</li>
        )}
        {items.map((c) => {
          const n = numberOf(c.id);
          const label = CORRECTION_STATUS_LABELS[c.status];
          const statusText = c.status === 'corrige' ? `✓ ${label}` : label;
          const selected = selectedId === c.id;
          const canStatus = c.authorId === meId || c.assigneeId === meId;
          const isAuthor = c.authorId === meId;
          const color = statusColor(c.status);
          return (
            <li key={c.id} style={{ listStyle: 'none' }}>
              {/* iter 6 — restyled onto the app card idiom (.ep-correction-card): 3px ink border, hard
                  offset shadow, translate hover; accent chrome when selected (data-selected). A left
                  status stripe + a filled status pill + a display-font number carry the status colour. */}
              <div className="ep-correction-card" data-status={c.status} data-selected={selected ? 'true' : undefined}>
                {/* A4 — left status stripe (green corrigé / accent à-corriger·en-cours). */}
                <span
                  className="ep-correction-stripe"
                  aria-hidden="true"
                  style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 6, background: color }}
                />
                <button
                  type="button"
                  onClick={() => onSelect(c.id)}
                  aria-label={`Correction ${n} — ${label}`}
                  aria-pressed={selected}
                  style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '12px 14px 8px 18px', cursor: 'pointer', font: 'inherit', color: 'inherit' }}
                >
                  {/* One-line header row (no wrap): the author/anchor group truncates with an ellipsis
                      so the status pill (flex:none) always stays on the same line and never overflows. */}
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, minWidth: 0 }}>
                    {/* Display-font number badge in the status colour (mirrors the image box). */}
                    <span
                      aria-hidden="true"
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: 15,
                        lineHeight: 1,
                        minWidth: 26,
                        height: 26,
                        padding: '0 6px',
                        borderRadius: 6,
                        background: color,
                        color: '#fff',
                        border: '2px solid var(--ink)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flex: 'none',
                      }}
                    >
                      {n}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'baseline', gap: 6, minWidth: 0, flex: '1 1 auto', overflow: 'hidden' }}>
                      <b style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{c.authorName}</b>
                      <span style={{ fontSize: 11, color: 'var(--ink2)', whiteSpace: 'nowrap', flex: 'none' }}>{anchorRef(c)}</span>
                    </span>
                    {/* Filled status pill — colour + label (not colour-only), never shrinks. */}
                    <span
                      style={{
                        flex: 'none',
                        fontSize: 10,
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        letterSpacing: '.03em',
                        color: '#fff',
                        background: color,
                        border: '2px solid var(--ink)',
                        borderRadius: 5,
                        padding: '2px 7px',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {statusText}
                    </span>
                  </span>
                  <span style={{ display: 'block', fontSize: 13, color: 'var(--ink)', lineHeight: 1.4 }}>{c.description}</span>
                </button>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px 12px 18px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink2)', fontFamily: 'var(--font-mono, monospace)' }}>
                    {`v${c.filedAgainstVersion}`}
                    {c.resolvedInVersion != null ? ` → v${c.resolvedInVersion}` : ''}
                  </span>
                  {canStatus && (
                    <button
                      type="button"
                      onClick={() => onStatusChange(c, NEXT_STATUS[c.status])}
                      disabled={busyId === c.id}
                      aria-label={`Statut de la correction ${n} : ${label} — passer à « ${CORRECTION_STATUS_LABELS[NEXT_STATUS[c.status]]} »`}
                      className="ep-btn-compact ep-btn-compact--ghost"
                    >
                      {busyId === c.id ? '…' : `→ ${CORRECTION_STATUS_LABELS[NEXT_STATUS[c.status]]}`}
                    </button>
                  )}
                  {isAuthor && (
                    <button
                      type="button"
                      onClick={() => onDelete(c)}
                      disabled={busyId === c.id}
                      aria-label={`Supprimer la demande ${n}`}
                      title="Supprimer la demande"
                      style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, background: 'none', border: 'none', borderRadius: 6, padding: 0, color: 'var(--ink2)', cursor: 'pointer' }}
                    >
                      <TrashIcon size={13} />
                    </button>
                  )}
                </div>
                {rowError?.id === c.id && (
                  <div role="alert" style={{ margin: '0 14px 12px 18px', color: 'var(--accent)', fontSize: 11, fontWeight: 700 }}>
                    {rowError.message}
                  </div>
                )}
              </div>
            </li>
          );
        })}
        {hasMore && (
          <li>
            <button
              type="button"
              onClick={onLoadMore}
              disabled={loadingMore}
              style={{ width: '100%', minHeight: 40, border: '2px solid var(--ink)', borderRadius: 8, background: 'var(--card)', fontWeight: 700, fontSize: 12, cursor: 'pointer', font: 'inherit' }}
            >
              {loadingMore ? 'Chargement…' : 'Charger plus'}
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}
