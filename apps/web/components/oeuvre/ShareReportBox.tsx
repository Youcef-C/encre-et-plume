'use client';

// DR-3 (2026-07-09): "Partager" / "Signaler" relocated from the WorkHero action row to sit ABOVE the
// "ÉQUIPE CRÉATIVE" sidebar box. Still stubs via usePersonalAction (PUB-5 share / PUB-6 report).
import { usePersonalAction } from '../../lib/usePersonalAction';
import { ShareIcon, FlagIcon } from '../icons';
import type { AccountSummary } from '@encre-et-plume/shared';

const btn: React.CSSProperties = {
  flex: 1,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  fontSize: 13,
  fontWeight: 700,
  border: '2px solid var(--ink)',
  borderRadius: 6,
  padding: '10px 12px',
  minHeight: 44,
  cursor: 'pointer',
  fontFamily: 'inherit',
  background: 'var(--card)',
  color: 'var(--ink)',
  boxShadow: '2px 2px 0 var(--shadow)',
};

export default function ShareReportBox({ account }: { account: AccountSummary | null }) {
  const { trigger, notice } = usePersonalAction(account);
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={trigger} style={btn}>
          <ShareIcon size={14} /> Partager
        </button>
        <button type="button" onClick={trigger} style={btn}>
          <FlagIcon size={14} /> Signaler
        </button>
      </div>
      {notice && (
        <p role="status" style={{ fontSize: 12, color: 'var(--ink2)', margin: '8px 0 0' }}>
          Bientôt disponible
        </p>
      )}
    </div>
  );
}
