'use client';

// DR-3 FE-7 — Work page sidebar: ÉQUIPE CRÉATIVE, DÉTAILS, support card, funding goals.
// Replica of ŒUVRE lines 936-968. One file for four small, always-co-rendered sections (ponytail).
import Link from 'next/link';
import type { WorkCreatorDto, FundingGoalDto, AccountSummary } from '@encre-et-plume/shared';
import { usePersonalAction } from '../../lib/usePersonalAction';
import { releaseYearLabel, formatEuros } from '../../lib/work';
import { PenNibIcon, BrushIcon, StarIcon } from '../icons';

const sidebarCard: React.CSSProperties = {
  border: '3px solid var(--ink)',
  borderRadius: 10,
  boxShadow: '5px 5px 0 var(--shadow)',
  background: 'var(--card)',
};

const ROLE_LABEL: Record<string, string> = {
  scenariste: 'Scénariste',
  dessinateur: 'Dessinateur',
};

function roleGlyph(role: string) {
  return role === 'dessinateur' ? <BrushIcon size={12} /> : <PenNibIcon size={12} />;
}

export function TeamSidebar({ team, account }: { team: WorkCreatorDto[]; account: AccountSummary | null }) {
  const { trigger, notice } = usePersonalAction(account);
  if (team.length === 0) return null;

  return (
    <div style={{ ...sidebarCard, overflow: 'hidden', marginBottom: 18 }}>
      <div
        aria-hidden="true"
        style={{
          height: 70,
          background:
            'radial-gradient(rgba(22,19,15,.35) 1.5px,transparent 1.6px), linear-gradient(110deg, var(--ink) 30%, var(--accent) 30%)',
          backgroundSize: 'var(--dot) var(--dot), cover',
          borderBottom: '3px solid var(--ink)',
        }}
      />
      <div style={{ padding: '0 16px 16px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', color: 'var(--ink2)', margin: '14px 0 10px' }}>
          ÉQUIPE CRÉATIVE
        </div>
        {team.map((member) => (
          <div key={member.id} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <Link href={`/${member.slug}`} style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, color: 'inherit', textDecoration: 'none' }}>
              <span
                aria-hidden="true"
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: '50%',
                  border: '2px solid var(--ink)',
                  backgroundColor: 'var(--tone)',
                  backgroundImage: 'radial-gradient(var(--ink) 1.3px,transparent 1.4px)',
                  backgroundSize: '5px 5px',
                  flex: 'none',
                }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{member.name}</div>
                <div style={{ fontSize: 12, color: 'var(--ink2)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  {roleGlyph(member.role)} {ROLE_LABEL[member.role] ?? member.role}
                  {member.city ? ` · ${member.city}` : ''}
                </div>
              </div>
            </Link>
            <button
              type="button"
              onClick={trigger}
              className="ep-btn-secondary"
              style={{ fontSize: 11, fontWeight: 700, borderWidth: 2, borderRadius: 5, padding: '3px 9px', boxShadow: 'none' }}
            >
              Suivre
            </button>
          </div>
        ))}
        {notice && (
          <p role="status" style={{ fontSize: 12, color: 'var(--ink2)', fontWeight: 700 }}>
            Bientôt disponible
          </p>
        )}
      </div>
    </div>
  );
}

export function DetailsSidebar({
  format,
  complete,
  chapterCount,
  audienceRating,
  publishedAt,
}: {
  format: string;
  complete: boolean;
  chapterCount: number;
  audienceRating: string;
  publishedAt: string | null;
}) {
  const rows: [string, string][] = [
    ['Type', format],
    ['Statut', complete ? 'Terminé' : 'En cours'],
    ['Chapitres', String(chapterCount)],
    ['Public', audienceRating],
    ['Sortie', releaseYearLabel(publishedAt)],
  ];

  return (
    <div style={{ ...sidebarCard, padding: 16, marginBottom: 18 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.06em', color: 'var(--ink2)', marginBottom: 10 }}>
        DÉTAILS
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
        {rows.map(([label, value]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--ink2)' }}>{label}</span>
            <b>{value}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

export function SupportCard({ account }: { account: AccountSummary | null }) {
  const { trigger, notice } = usePersonalAction(account);

  return (
    <div style={{ border: '3px dashed var(--ink)', borderRadius: 10, padding: 14, fontSize: 13 }}>
      <div style={{ fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
        <StarIcon size={13} style={{ color: 'var(--accent)' }} /> Soutenez les auteurs
      </div>
      <div style={{ color: 'var(--ink2)', lineHeight: 1.4 }}>
        Un abonnement mensuel pour accéder aux planches en avant-première &amp; coulisses.
      </div>
      <button
        type="button"
        onClick={trigger}
        className="ep-btn-primary"
        style={{
          marginTop: 10,
          width: '100%',
          textAlign: 'center',
          fontWeight: 700,
          border: '2px solid var(--ink)',
          padding: 8,
          cursor: 'pointer',
          boxShadow: '2px 2px 0 var(--shadow)',
          fontFamily: 'inherit',
        }}
      >
        Soutenir · à partir de 3 €/mois
      </button>
      {notice && (
        <p role="status" style={{ marginTop: 6, fontSize: 12, color: 'var(--ink2)', fontWeight: 700, textAlign: 'center' }}>
          Bientôt disponible
        </p>
      )}
    </div>
  );
}

export function FundingGoals({ goals }: { goals: FundingGoalDto[] }) {
  if (goals.length === 0) return null;

  return (
    <div style={{ ...sidebarCard, marginTop: 16, padding: 16 }}>
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, textTransform: 'uppercase', lineHeight: 1 }}>
        Objectifs de financement
      </div>
      <div style={{ fontSize: 12, color: 'var(--ink2)', margin: '4px 0 14px' }}>Débloqués grâce à vos soutiens</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {goals.map((goal) => (
          <div key={goal.id}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
              <b style={{ fontSize: 13 }}>{goal.title}</b>
              <b style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--accent)' }}>{goal.pct}%</b>
            </div>
            <div
              role="progressbar"
              aria-valuenow={goal.pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={goal.title}
              style={{ height: 11, border: '2px solid var(--ink)', borderRadius: 6, overflow: 'hidden', background: 'var(--paper)' }}
            >
              <div style={{ height: '100%', background: 'var(--accent)', width: `${goal.pct}%` }} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink2)', marginTop: 5 }}>
              {formatEuros(goal.currentCents)} € / {formatEuros(goal.targetCents)} € par mois
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
