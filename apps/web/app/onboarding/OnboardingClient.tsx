'use client';

import { useEffect, useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CREATOR_ROLES,
  ONBOARDING_GENRE_TAGS,
  LOOKING_FOR_STATUSES,
  type CreatorRole,
  type LookingForStatus,
  type OnboardingRequest,
} from '@encre-et-plume/shared';
import { useSession } from '../../lib/session';
import { completeOnboarding } from '../../lib/api';

// ── French labels (verbatim from spec) ───────────────────────────────────────

const CREATOR_LABELS: Record<CreatorRole, string> = {
  scenariste: 'Scénariste',
  dessinateur: 'Dessinateur·rice',
};

const LOOKING_FOR_LABELS: Record<LookingForStatus, string> = {
  cherche_dessinateur: 'Je cherche un·e dessinateur·rice',
  cherche_scenariste: 'Je cherche un·e scénariste',
  ouvert: 'Ouvert·e aux propositions',
  regarde: 'Je regarde seulement',
};

// ── Chip primitives ───────────────────────────────────────────────────────────

function Chip({
  label,
  selected,
  onToggle,
}: {
  label: string;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      style={{
        background: selected ? 'var(--accent)' : 'var(--card)',
        color: selected ? '#fff' : 'var(--ink)',
        border: '2px solid var(--border)',
        borderRadius: 6,
        padding: '10px 18px',
        fontSize: 14,
        fontWeight: 700,
        cursor: 'pointer',
        fontFamily: 'inherit',
        minHeight: 44,
        transition: 'background 0.1s, color 0.1s',
        boxShadow: selected ? '2px 2px 0 var(--shadow)' : 'none',
      }}
    >
      {label}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function OnboardingClient() {
  const { account, loading, refresh } = useSession();
  const router = useRouter();
  const headingId = useId();

  // Wizard state
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [creatorRoles, setCreatorRoles] = useState<Set<CreatorRole>>(new Set());
  const [isReader, setIsReader] = useState(false);
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [lookingFor, setLookingFor] = useState<LookingForStatus | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guard: redirect when session state is resolved
  useEffect(() => {
    if (loading) return;
    if (!account) {
      router.replace('/connexion');
    } else if (account.onboarded) {
      router.replace('/');
    }
  }, [account, loading, router]);

  if (loading || !account || account.onboarded) {
    return (
      <div
        style={{
          minHeight: 'calc(100dvh - 69px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px 16px',
        }}
      >
        <p style={{ color: 'var(--ink2)', fontSize: 15 }}>Chargement…</p>
      </div>
    );
  }

  // Derived
  const isCreatorPath = creatorRoles.size > 0;
  const totalSteps = isCreatorPath ? 3 : 2;
  const isLastStep =
    (step === 2 && !isCreatorPath) || step === 3;

  // ── Step 1 handlers ──────────────────────────────────────────────────────────

  function toggleCreatorRole(role: CreatorRole) {
    setIsReader(false);
    setCreatorRoles((prev) => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
  }

  function selectReader() {
    setCreatorRoles(new Set());
    setIsReader(true);
  }

  // ── Step 2 handlers ──────────────────────────────────────────────────────────

  function toggleTag(tag: string) {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return next;
    });
  }

  // ── Submission ───────────────────────────────────────────────────────────────

  async function doSubmit(
    roles: Set<CreatorRole>,
    tags: Set<string>,
    lf: LookingForStatus | null,
  ) {
    setSaving(true);
    setError(null);
    const body: OnboardingRequest = {};
    if (roles.size > 0) body.creatorRoles = [...roles];
    if (tags.size > 0) body.tags = [...tags];
    if (lf) body.lookingFor = lf;
    try {
      await completeOnboarding(body);
      await refresh();
      router.replace('/');
    } catch {
      setError('Une erreur est survenue. Veuillez réessayer.');
      setSaving(false);
    }
  }

  // ── Navigation ───────────────────────────────────────────────────────────────

  // "Passer" — skip this step's selection and advance (or submit if last)
  function handleSkip() {
    if (step === 1) {
      setCreatorRoles(new Set());
      setIsReader(false);
      setStep(2);
    } else if (step === 2) {
      const tags = new Set<string>(); // clear step 2
      setSelectedTags(tags);
      if (creatorRoles.size === 0) {
        void doSubmit(creatorRoles, tags, null);
      } else {
        setStep(3);
      }
    } else {
      // step 3: submit without lookingFor
      void doSubmit(creatorRoles, selectedTags, null);
    }
  }

  // "Suivant" / "C'est parti !" — keep selection and advance (or submit if last)
  function handleNext() {
    if (step === 1) {
      setStep(2);
    } else if (step === 2) {
      if (creatorRoles.size === 0) {
        void doSubmit(creatorRoles, selectedTags, null);
      } else {
        setStep(3);
      }
    } else {
      void doSubmit(creatorRoles, selectedTags, lookingFor);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        minHeight: 'calc(100dvh - 69px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 16px',
      }}
    >
      <div
        role="dialog"
        aria-labelledby={headingId}
        className="ep-card"
        style={{
          width: '100%',
          maxWidth: 540,
          padding: '40px 36px',
        }}
      >
        {/* Progress (aria-live so screen readers announce step changes) */}
        <div
          role="status"
          aria-live="polite"
          style={{
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--ink2)',
            marginBottom: 20,
          }}
        >
          Étape {step} sur {totalSteps}
        </div>

        {/* Error alert */}
        {error && (
          <div
            role="alert"
            style={{
              background: 'var(--accent-soft)',
              border: '2px solid var(--accent)',
              borderRadius: 6,
              padding: '10px 16px',
              color: 'var(--accent)',
              fontWeight: 700,
              fontSize: 14,
              marginBottom: 20,
            }}
          >
            {error}
          </div>
        )}

        {/* ── Step 1 — "Qui êtes-vous ?" ─────────────────────────────────────── */}
        {step === 1 && (
          <>
            <h1
              id={headingId}
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(28px, 5vw, 40px)',
                textTransform: 'uppercase',
                lineHeight: 0.95,
                marginBottom: 28,
                color: 'var(--ink)',
              }}
            >
              Qui êtes-vous ?
            </h1>

            <fieldset
              style={{ border: 'none', padding: 0, margin: 0 }}
              aria-label="Votre rôle"
            >
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 12,
                  marginBottom: 32,
                }}
              >
                {CREATOR_ROLES.map((role) => (
                  <Chip
                    key={role}
                    label={CREATOR_LABELS[role]}
                    selected={creatorRoles.has(role)}
                    onToggle={() => toggleCreatorRole(role)}
                  />
                ))}
                <Chip
                  label="Je suis là pour lire"
                  selected={isReader}
                  onToggle={selectReader}
                />
              </div>
            </fieldset>
          </>
        )}

        {/* ── Step 2 — "Vos genres & affinités" ──────────────────────────────── */}
        {step === 2 && (
          <>
            <h1
              id={headingId}
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(28px, 5vw, 40px)',
                textTransform: 'uppercase',
                lineHeight: 0.95,
                marginBottom: 28,
                color: 'var(--ink)',
              }}
            >
              Vos genres & affinités
            </h1>

            <fieldset
              style={{ border: 'none', padding: 0, margin: 0 }}
              aria-label="Genres préférés"
            >
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 10,
                  marginBottom: 32,
                }}
              >
                {ONBOARDING_GENRE_TAGS.map((tag) => (
                  <Chip
                    key={tag}
                    label={tag}
                    selected={selectedTags.has(tag)}
                    onToggle={() => toggleTag(tag)}
                  />
                ))}
              </div>
            </fieldset>
          </>
        )}

        {/* ── Step 3 — "Que cherchez-vous ?" (creators only) ─────────────────── */}
        {step === 3 && (
          <>
            <h1
              id={headingId}
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(28px, 5vw, 40px)',
                textTransform: 'uppercase',
                lineHeight: 0.95,
                marginBottom: 28,
                color: 'var(--ink)',
              }}
            >
              Que cherchez-vous ?
            </h1>

            <fieldset
              style={{ border: 'none', padding: 0, margin: 0 }}
              aria-label="Ce que vous cherchez"
            >
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  marginBottom: 32,
                }}
              >
                {LOOKING_FOR_STATUSES.map((status) => (
                  <Chip
                    key={status}
                    label={LOOKING_FOR_LABELS[status]}
                    selected={lookingFor === status}
                    onToggle={() =>
                      setLookingFor((prev) => (prev === status ? null : status))
                    }
                  />
                ))}
              </div>
            </fieldset>
          </>
        )}

        {/* ── Controls ──────────────────────────────────────────────────────────── */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <button
            type="button"
            onClick={handleSkip}
            disabled={saving}
            className="ep-btn-secondary"
            style={{ minHeight: 44 }}
          >
            Passer
          </button>

          <button
            type="button"
            onClick={handleNext}
            disabled={saving}
            className="ep-btn-primary"
            style={{ minHeight: 44 }}
          >
            {saving
              ? 'Envoi…'
              : isLastStep
                ? "C'est parti !"
                : 'Suivant'}
          </button>
        </div>
      </div>
    </div>
  );
}
