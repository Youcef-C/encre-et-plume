'use client';

// CS-1 — shared "Soutien" editor: subscription tiers, "Autoriser les dons uniques", and funding
// goals. A faithful replica of the manga wizard's step-3 rows (prototype 1808–1829). Controlled by
// the parent (the NewProjectWizard step 3 and the PublishIllustrationForm Soutien section both own
// the state) so each can fold the values into its own request. Revenue split is NOT here — it is
// project-member-specific and lives in the wizard; a standalone illustration has a single author.
import type { SoutienTier, SoutienGoalInput } from '@encre-et-plume/shared';
import OnBrandCheckbox from '../form/OnBrandCheckbox';
import { XIcon } from '../icons';

export type SoutienTierDraft = { name: string; euros: string };
export type SoutienGoalDraft = { title: string; euros: string };

export interface SoutienValue {
  tiers: SoutienTierDraft[];
  allowDonations: boolean;
  goals: SoutienGoalDraft[];
}

export const EMPTY_SOUTIEN: SoutienValue = { tiers: [], allowDonations: false, goals: [] };

/** €"5,50" | "5.5" → cents; empty/invalid → 0 (mirrors NewCollectionForm). */
function eurosToCents(v: string): number {
  const n = Number.parseFloat(v.replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

/** Map the drafts to the request shape (cents on the wire), dropping empty rows. Returns only the
 *  keys that carry data so an untouched Soutien section adds nothing to the request. */
export function soutienToRequest(v: SoutienValue): {
  tiers?: SoutienTier[];
  allowDonations?: boolean;
  goals?: SoutienGoalInput[];
} {
  const tiers = v.tiers.filter((t) => t.name.trim()).map((t) => ({ name: t.name.trim(), priceCents: eurosToCents(t.euros) }));
  const goals = v.goals.filter((g) => g.title.trim()).map((g) => ({ title: g.title.trim(), targetCents: eurosToCents(g.euros) }));
  return {
    ...(tiers.length ? { tiers } : {}),
    ...(v.allowDonations ? { allowDonations: true } : {}),
    ...(goals.length ? { goals } : {}),
  };
}

const label: React.CSSProperties = { fontSize: 13, fontWeight: 700, marginBottom: 9 };
const rowBox: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 9,
  border: '2px solid var(--ink)',
  borderRadius: 7,
  padding: '7px 10px',
  background: 'var(--card)',
  flexWrap: 'wrap',
};
const nameInput: React.CSSProperties = {
  flex: 1,
  minWidth: 100,
  border: 'none',
  background: 'transparent',
  fontSize: 14,
  fontWeight: 700,
  fontFamily: 'inherit',
  color: 'var(--ink)',
  outline: 'none',
};
const euroBox: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
  border: '2px solid var(--ink)',
  borderRadius: 6,
  padding: '4px 9px',
  background: 'var(--paper)',
};
const euroInput: React.CSSProperties = {
  width: 34,
  border: 'none',
  background: 'transparent',
  fontSize: 15,
  fontWeight: 700,
  fontFamily: 'var(--font-display)',
  color: 'var(--accent)',
  outline: 'none',
  textAlign: 'right',
};
const dot: React.CSSProperties = { width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', flex: 'none' };
const removeBtn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'none',
  border: 'none',
  color: 'var(--ink2)',
  cursor: 'pointer',
  fontSize: 13,
  padding: 4,
  minHeight: 32,
  minWidth: 32,
  flex: 'none',
  fontFamily: 'inherit',
};
const addBtn: React.CSSProperties = {
  width: '100%',
  border: '2px dashed var(--ink)',
  borderRadius: 7,
  padding: 9,
  textAlign: 'center',
  fontSize: 13,
  fontWeight: 700,
  color: 'var(--accent)',
  cursor: 'pointer',
  background: 'transparent',
  fontFamily: 'inherit',
  minHeight: 44,
};

export default function SoutienFields({ value, onChange }: { value: SoutienValue; onChange: (v: SoutienValue) => void }) {
  const setTiers = (tiers: SoutienTierDraft[]) => onChange({ ...value, tiers });
  const setGoals = (goals: SoutienGoalDraft[]) => onChange({ ...value, goals });

  return (
    <div>
      {/* Paliers d'abonnement */}
      <div style={label}>Paliers d’abonnement</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 9 }}>
        {value.tiers.map((t, i) => (
          <div key={i} style={rowBox}>
            <span aria-hidden style={dot} />
            <input
              aria-label={`Nom du palier ${i + 1}`}
              value={t.name}
              onChange={(e) => setTiers(value.tiers.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
              placeholder="Nom du palier"
              style={nameInput}
            />
            <div style={euroBox}>
              <input
                aria-label={`Prix mensuel du palier ${i + 1} (€)`}
                inputMode="numeric"
                value={t.euros}
                onChange={(e) => setTiers(value.tiers.map((x, j) => (j === i ? { ...x, euros: e.target.value } : x)))}
                placeholder="0"
                style={euroInput}
              />
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)' }}>€/mois</span>
            </div>
            <button type="button" aria-label={`Retirer le palier ${i + 1}`} onClick={() => setTiers(value.tiers.filter((_, j) => j !== i))} style={removeBtn}>
              <XIcon size={14} />
            </button>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => setTiers([...value.tiers, { name: '', euros: '' }])} style={{ ...addBtn, marginBottom: 12 }}>
        ＋ Ajouter un palier
      </button>

      {/* Autoriser les dons uniques */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, border: '2px solid var(--ink)', borderRadius: 8, padding: '10px 13px', background: 'var(--paper)', marginBottom: 20 }}>
        <OnBrandCheckbox
          label={
            <span>
              <b style={{ fontSize: 13 }}>Autoriser les dons uniques</b>
              <span style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--ink2)' }}>Soutien ponctuel libre, sans engagement.</span>
            </span>
          }
          checked={value.allowDonations}
          onChange={(e) => onChange({ ...value, allowDonations: e.target.checked })}
          style={{ alignItems: 'flex-start' }}
        />
      </div>

      {/* Objectifs de financement */}
      <div style={label}>
        Objectifs de financement <span style={{ fontWeight: 500, color: 'var(--ink2)' }}>· optionnel</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 9 }}>
        {value.goals.map((g, i) => (
          <div key={i} style={rowBox}>
            <span aria-hidden style={dot} />
            <input
              aria-label={`Titre de l’objectif ${i + 1}`}
              value={g.title}
              onChange={(e) => setGoals(value.goals.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
              placeholder="Objectif"
              style={nameInput}
            />
            <div style={euroBox}>
              <input
                aria-label={`Cible de l’objectif ${i + 1} (€ / mois)`}
                inputMode="numeric"
                value={g.euros}
                onChange={(e) => setGoals(value.goals.map((x, j) => (j === i ? { ...x, euros: e.target.value } : x)))}
                placeholder="0"
                style={euroInput}
              />
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)' }}>€/mois</span>
            </div>
            <button type="button" aria-label={`Retirer l’objectif ${i + 1}`} onClick={() => setGoals(value.goals.filter((_, j) => j !== i))} style={removeBtn}>
              <XIcon size={14} />
            </button>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => setGoals([...value.goals, { title: '', euros: '' }])} style={addBtn}>
        ＋ Ajouter un objectif
      </button>
    </div>
  );
}
