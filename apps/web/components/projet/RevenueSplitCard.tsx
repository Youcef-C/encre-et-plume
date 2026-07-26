'use client';

// CS-10 — replica of the prototype's "PARTAGE DES REVENUS" card (.dc.html 2297–2325): display-font
// title + hint, paper header row (Membre | Part définie | Part effective), halftone member rows with
// the accent progress bar and the big Anton readout.
// Deviations (plan §4): D2 "Part définie" is an editable 0–100 input for managers with a live total;
// D3 the pending-reserve banner / "Simuler : Léa accepte" demo and the effective-share redistribution
// are dropped (an invitation carries no share in CS-10, so defined = effective) — the footer carries
// the live total, the sum-100 validation and the save action instead.
// D2b (round 2, U-2): for managers the "Part effective" bar IS a native <input type="range">
// styled with the shared `.ep-range` class — the numeric entry stays alongside it and both write
// one draft. Read-only viewers keep the static bar.
import { useEffect, useRef, useState } from 'react';
import type { GroupMemberDto, GroupMembersResponse } from '@encre-et-plume/shared';
import { CheckIcon, CreatorRoleIcon } from '../icons';

const GREEN = '#1f8a5b';

const card: React.CSSProperties = {
  marginTop: 24,
  background: 'var(--card)',
  border: '3px solid var(--ink)',
  borderRadius: 12,
  boxShadow: '6px 6px 0 var(--shadow)',
  overflow: 'hidden',
};

/** Prototype split-row disc: 36px halftone dots over var(--tone) (real avatar when set). */
function SplitAvatar({ avatar }: { avatar: string | null }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: 36,
        height: 36,
        borderRadius: '50%',
        border: '2px solid var(--ink)',
        flex: 'none',
        ...(avatar
          ? { background: `center/cover url(${avatar})` }
          : {
              backgroundColor: 'var(--tone)',
              backgroundImage: 'radial-gradient(var(--ink) 1.3px,transparent 1.4px)',
              backgroundSize: '5px 5px',
            }),
      }}
    />
  );
}

const clampPct = (raw: string): number => {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
};

export interface RevenueSplitCardProps {
  group: GroupMembersResponse;
  selfAccountId: string | null;
  saving: boolean;
  error: string | null;
  onSave: (shares: { memberId: string; pct: number }[]) => void;
}

export default function RevenueSplitCard({ group, selfAccountId, saving, error, onSave }: RevenueSplitCardProps) {
  const canManage = group.viewer.canManage;
  // Draft values are kept as strings so an emptied field doesn't jump back to 0 while typing.
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(group.members.map((m) => [m.id, String(m.sharePct)])),
  );

  // N8: `group.members` is a NEW array on every refreshed response, including refreshes that have
  // nothing to do with the split (a permission toggle) — resetting on identity alone discarded
  // in-progress edits. Reset only when the membership or the stored shares actually changed; a save
  // or a revoke does change them, so authoritative server state still wins there.
  const shareKey = group.members.map((m) => `${m.id}:${m.sharePct}`).join(',');
  const lastKey = useRef(shareKey);
  useEffect(() => {
    if (lastKey.current === shareKey) return;
    lastKey.current = shareKey;
    setDraft(Object.fromEntries(group.members.map((m) => [m.id, String(m.sharePct)])));
    // `group.members` is intentionally not a dependency — `shareKey` is its stable projection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shareKey]);

  const pctOf = (m: GroupMemberDto) => (canManage ? clampPct(draft[m.id] ?? '') : m.sharePct);
  const total = group.members.reduce((sum, m) => sum + pctOf(m), 0);
  const dirty = group.members.some((m) => pctOf(m) !== m.sharePct);

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '16px 18px 12px', flexWrap: 'wrap' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, textTransform: 'uppercase' }}>
          Partage des revenus
        </div>
        <span style={{ fontSize: 12, color: 'var(--ink2)', fontWeight: 500 }}>
          parts définies à la création · recalculées selon les membres actifs
        </span>
      </div>

      <div
        className="ep-split-head"
        style={{
          padding: '9px 18px',
          borderTop: '2px solid var(--ink)',
          borderBottom: '2px solid var(--border)',
          background: 'var(--paper)',
          fontSize: 11,
          fontWeight: 700,
          color: 'var(--ink2)',
          letterSpacing: '.03em',
          textTransform: 'uppercase',
        }}
      >
        <span>Membre</span>
        <span>Part définie</span>
        <span>Part effective</span>
      </div>

      {group.members.map((m, i) => {
        const pct = pctOf(m);
        const self = m.accountId === selfAccountId;
        return (
          <div
            key={m.id}
            className="ep-split-row"
            style={{
              alignItems: 'center',
              padding: '13px 18px',
              ...(i === group.members.length - 1 ? {} : { borderBottom: '2px solid var(--border)' }),
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
              <SplitAvatar avatar={m.avatar} />
              <div style={{ minWidth: 0 }}>
                <b style={{ fontSize: 14 }}>{self ? 'Vous' : m.name}</b>
                {/* U-4: the check is an icon, never the "✓" character. */}
                <div
                  style={{ fontSize: 11, fontWeight: 700, color: GREEN, display: 'flex', alignItems: 'center', gap: 3 }}
                >
                  <CheckIcon size={12} />
                  Accepté ·<CreatorRoleIcon role={m.creatorRole} />
                </div>
              </div>
            </div>

            {canManage ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  inputMode="numeric"
                  // The slider is the primary control and carries the story's label verbatim; the
                  // numeric entry gets a distinct accessible name for the same value.
                  aria-label={self ? 'Votre part exacte' : `Part exacte de ${m.name}`}
                  value={draft[m.id] ?? ''}
                  disabled={saving}
                  onChange={(e) => setDraft((d) => ({ ...d, [m.id]: e.target.value }))}
                  style={{
                    width: 74,
                    minHeight: 44,
                    fontSize: 15,
                    fontWeight: 700,
                    fontFamily: 'inherit',
                    padding: '6px 8px',
                    border: '2px solid var(--ink)',
                    borderRadius: 6,
                    background: 'var(--card)',
                    color: 'var(--ink)',
                  }}
                />
                <span aria-hidden="true" style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink2)' }}>
                  %
                </span>
              </span>
            ) : (
              <b style={{ fontSize: 15 }}>
                {m.sharePct} %{self && <div style={{ fontSize: 11, color: 'var(--ink2)' }}>Votre part</div>}
              </b>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              {canManage ? (
                // U-2 — the prototype's accent bar, made adjustable. Native range: arrows / Home /
                // End / drag come for free, the value is announced natively; no custom drag widget.
                <span className="ep-range-wrap">
                  <input
                    type="range"
                    className="ep-range"
                    min={0}
                    max={100}
                    step={1}
                    aria-label={self ? 'Votre part' : `Part de ${m.name}`}
                    value={pct}
                    disabled={saving}
                    onChange={(e) => setDraft((d) => ({ ...d, [m.id]: e.target.value }))}
                    style={{ ['--pct' as string]: `${Math.min(100, pct)}%` }}
                  />
                </span>
              ) : (
                <div
                  aria-hidden="true"
                  style={{
                    flex: 1,
                    height: 12,
                    border: '2px solid var(--ink)',
                    borderRadius: 7,
                    overflow: 'hidden',
                    background: 'var(--paper)',
                  }}
                >
                  <div style={{ height: '100%', background: 'var(--accent)', width: `${Math.min(100, pct)}%` }} />
                </div>
              )}
              <b style={{ fontFamily: 'var(--font-display)', fontSize: 22, minWidth: 52, textAlign: 'right' }}>{pct} %</b>
            </div>
          </div>
        );
      })}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          padding: '12px 18px',
          borderTop: '2px solid var(--border)',
          background: 'var(--paper)',
          fontSize: 12,
          color: 'var(--ink2)',
          lineHeight: 1.5,
        }}
      >
        <div aria-live="polite">
          <b style={{ color: 'var(--ink)', fontSize: 13 }}>{`Total : ${total} %`}</b>
        </div>
        {canManage && total !== 100 && (
          <span role="alert" style={{ fontSize: 13, fontWeight: 700, color: 'var(--danger)' }}>
            Le total des parts doit faire 100 %.
          </span>
        )}
        {error && (
          <span role="alert" style={{ fontSize: 13, fontWeight: 700, color: 'var(--danger)' }}>
            {error}
          </span>
        )}
        <div style={{ flex: 1 }} />
        {canManage && (
          <button
            type="button"
            className="ep-btn-primary"
            disabled={saving || total !== 100 || !dirty}
            aria-busy={saving || undefined}
            onClick={() => onSave(group.members.map((m) => ({ memberId: m.id, pct: pctOf(m) })))}
            style={{ fontSize: 13, fontWeight: 700, borderRadius: 6, padding: '8px 16px', minHeight: 44 }}
          >
            Enregistrer la répartition
          </button>
        )}
      </div>
    </div>
  );
}
