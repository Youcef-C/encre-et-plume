'use client';

// CS-1 — "Nouveau projet" wizard, a faithful replica of the prototype's data-page="creer" section
// (proto 1747–1852): a 740px ink-bordered card, header + ✕, a clickable 3-dot step rail
// (Type · Détails · Soutien), and the drawn footer. All three type cards are single-select:
// Manga/Histoire walk this wizard and submit POST /projects (returns to /projets); Illustration(s)
// runs the real publish flow INLINE inside the same shell (the embedded PublishIllustrationForm,
// split Détails / Soutien) and posts to /illustrations. Deep-link /creer?type=illustration (the
// Galerie CTA) opens straight on the Illustration Détails step.
//
// On-brand substitutions (CLAUDE.md): no emojis — role glyphs use icons.tsx (PenNib/Brush); genre &
// thèmes use the F-20 GenreChip + GenreSuggestInput (never free text). Induced deviations vs the raw
// prototype (graded against plan §1): optional cover slot, the revenue-split rows are all adjustable
// (the proto draws the last member as read-only "le reste"; we make every row a stepper so the 100 %
// rule is user-controlled, per plan §4 / the story's "must total 100 %").
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CATALOG_AUDIENCE_RATINGS,
  resolveGenreId,
  type ActiveContest,
  type ApiError,
  type CatalogAudienceRating,
  type CreateProjectRequest,
  type CreatorRole,
  type MediaResponse,
  type PartnerCard,
  type ProjectType,
  type ProjectVisibility,
} from '@encre-et-plume/shared';
import { createProject, getActiveContest, getPartners } from '../../lib/api';
import { useSession } from '../../lib/session';
import { BrushIcon, PenNibIcon } from '../icons';
import GenreChip from '../GenreChip';
import GenreSuggestInput from '../GenreSuggestInput';
import OnBrandSelect from '../form/OnBrandSelect';
import HashtagChipsInput from '../form/HashtagChipsInput';
import UploadControl from '../UploadControl';
import { COVER_FRAME_HEIGHT } from '../../lib/cover';
import SoutienFields, { EMPTY_SOUTIEN, soutienToRequest, type SoutienValue } from './SoutienFields';
import PublishIllustrationForm, { type PublishIllustrationHandle } from './PublishIllustrationForm';

type Step = 1 | 2 | 3;
type WizardType = ProjectType | 'illustration';
type Member = { id: string; name: string; role: CreatorRole | null };

const MANGA_STEPS: { n: Step; label: string }[] = [
  { n: 1, label: 'Type' },
  { n: 2, label: 'Détails' },
  { n: 3, label: 'Soutien' },
];
// The Illustration branch embeds the real publish flow, split across the SAME Type·Détails·Soutien
// rail as the manga branch (for consistency): Détails = the illustration form, Soutien = its Soutien
// fields + the "Publier" submit.
const ILLUS_STEPS: { n: Step; label: string }[] = [
  { n: 1, label: 'Type' },
  { n: 2, label: 'Détails' },
  { n: 3, label: 'Soutien' },
];

/** Deep-link support: /creer?type=illustration (Galerie CTA) pre-selects the Illustration branch. */
function readInitialType(): WizardType {
  if (typeof window === 'undefined') return 'manga';
  const t = new URLSearchParams(window.location.search).get('type');
  return t === 'illustration' || t === 'story' ? t : 'manga';
}

const VISIBILITIES: { value: ProjectVisibility; label: string }[] = [
  { value: 'prive', label: 'Privé' },
  { value: 'invitation', label: 'Sur invitation' },
  { value: 'public', label: 'Public' },
];

const sectionLabel: React.CSSProperties = { fontSize: 13, fontWeight: 700, margin: '0 0 8px' };
const stepHeading: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--ink2)',
  letterSpacing: '.05em',
  margin: '18px 0 11px',
};
const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '2px solid var(--ink)',
  borderRadius: 8,
  padding: '10px 12px',
  fontSize: 14,
  fontFamily: 'inherit',
  background: 'var(--card)',
  color: 'var(--ink)',
  boxSizing: 'border-box',
};
const chip = (active: boolean): React.CSSProperties => ({
  background: active ? 'var(--accent)' : 'var(--card)',
  color: active ? '#fff' : 'var(--ink2)',
  border: '2px solid var(--ink)',
  borderRadius: 5,
  padding: '6px 12px',
  minHeight: 34,
  fontSize: 13,
  fontWeight: active ? 700 : 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
});
const footerBtn: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  background: 'var(--card)',
  border: '2px solid var(--ink)',
  borderRadius: 6,
  padding: '9px 16px',
  minHeight: 44,
  cursor: 'pointer',
  fontFamily: 'inherit',
  color: 'var(--ink)',
};
const accentBtn: React.CSSProperties = {
  ...footerBtn,
  background: 'var(--accent)',
  color: '#fff',
  boxShadow: '3px 3px 0 var(--shadow)',
};
const stepBtn: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  background: 'none',
  border: 'none',
  fontSize: 13,
  fontWeight: 700,
  fontFamily: 'inherit',
  color: 'var(--ink)',
  padding: 0,
};
const errText: React.CSSProperties = { fontSize: 13, color: 'var(--accent)', fontWeight: 700, margin: '7px 0 0' };

function RoleGlyph({ role, size = 14 }: { role: CreatorRole | null; size?: number }) {
  if (role === 'dessinateur') return <BrushIcon size={size} />;
  return <PenNibIcon size={size} />;
}

function roleLabel(role: CreatorRole | null): string {
  if (role === 'dessinateur') return 'Dessinateur·rice';
  if (role === 'scenariste') return 'Scénariste';
  return 'Créateur·rice';
}

/** Even split rounded to 5-pt steps; the owner absorbs the remainder so the default totals 100 %. */
function defaultSplit(ids: string[]): Record<string, number> {
  const n = ids.length;
  if (n <= 1) return Object.fromEntries(ids.map((id) => [id, 100]));
  const each = Math.round(100 / n / 5) * 5;
  const map: Record<string, number> = {};
  ids.slice(1).forEach((id) => (map[id] = each));
  const rest = 100 - each * (n - 1);
  map[ids[0]] = Math.max(0, rest);
  return map;
}

export default function NewProjectWizard() {
  const router = useRouter();
  const { account } = useSession();

  const initialType = readInitialType();
  const [step, setStep] = useState<Step>(initialType === 'illustration' ? 2 : 1);
  const [type, setType] = useState<WizardType>(initialType);
  const isIllus = type === 'illustration';
  const steps = isIllus ? ILLUS_STEPS : MANGA_STEPS;

  // Illustration branch: the embedded form owns its submit; the wizard footer's "Publier" triggers it
  // via this ref and mirrors the form's pending/busy status.
  const illusRef = useRef<PublishIllustrationHandle>(null);
  const [illusStatus, setIllusStatus] = useState({ pending: false, uploadBusy: false });

  // Step 2
  const [title, setTitle] = useState('');
  const [synopsis, setSynopsis] = useState('');
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [format, setFormat] = useState<'serie' | 'oneshot'>('serie');
  const [contest, setContest] = useState<ActiveContest | null>(null);
  const [contestLoading, setContestLoading] = useState(true);
  const [contestId, setContestId] = useState('');
  // One F-20 picker (the vocabulary has no demographic/theme split, so two pickers were redundant):
  // the FIRST chip is the primary genre (→ body.genre / the badge), the rest are themes (→ body.themes).
  const [genres, setGenres] = useState<string[]>([]); // F-20 fr labels, ordered (genres[0] = primary)
  const [audience, setAudience] = useState<CatalogAudienceRating>('Tous publics');
  const [invites, setInvites] = useState<Member[]>([]);
  const [seeking, setSeeking] = useState<{ scenariste: number; dessinateur: number }>({ scenariste: 0, dessinateur: 0 });
  const [visibility, setVisibility] = useState<ProjectVisibility>('prive');
  const [coverMediaId, setCoverMediaId] = useState<string | null>(null);
  const [coverBusy, setCoverBusy] = useState(false);

  // Invite search
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PartnerCard[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  // Step 3
  const [soutien, setSoutien] = useState<SoutienValue>(EMPTY_SOUTIEN);
  const [split, setSplit] = useState<Record<string, number>>({});

  const [titleError, setTitleError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const owner: Member = useMemo(
    () => ({ id: account?.id ?? 'me', name: 'Vous', role: null }),
    [account?.id],
  );
  const members = useMemo(() => [owner, ...invites], [owner, invites]);
  const memberIdsKey = members.map((m) => m.id).join(',');

  // Reset the split to an even default whenever the member set changes.
  useEffect(() => {
    setSplit(defaultSplit(memberIdsKey ? memberIdsKey.split(',') : []));
  }, [memberIdsKey]);

  useEffect(() => {
    let cancelled = false;
    getActiveContest()
      .then((c) => !cancelled && setContest(c))
      .catch(() => {})
      .finally(() => !cancelled && setContestLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  // Debounced invite search (induced GET /partners?q).
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    const t = setTimeout(() => {
      const params = new URLSearchParams({ q });
      getPartners(params)
        .then((res) => setResults(res.items))
        .catch(() => setResults([]))
        .finally(() => setSearchLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const splitTotal = members.reduce((sum, m) => sum + (split[m.id] ?? 0), 0);
  const splitValid = members.length <= 1 || splitTotal === 100;

  const suggestions = results.filter((r) => r.userId !== owner.id && !invites.some((m) => m.id === r.userId));

  function addInvite(p: PartnerCard) {
    setInvites((cur) => (cur.some((m) => m.id === p.userId) ? cur : [...cur, { id: p.userId, name: p.name, role: p.role }]));
    setQuery('');
    setResults([]);
  }
  function removeInvite(id: string) {
    setInvites((cur) => cur.filter((m) => m.id !== id));
  }

  function bumpSeeking(role: 'scenariste' | 'dessinateur', delta: number) {
    setSeeking((cur) => ({ ...cur, [role]: Math.min(5, Math.max(0, cur[role] + delta)) }));
  }
  function bumpSplit(id: string, delta: number) {
    setSplit((cur) => ({ ...cur, [id]: Math.min(100, Math.max(0, (cur[id] ?? 0) + delta)) }));
  }

  const close = useCallback(() => router.back(), [router]);

  function goNext() {
    if (step === 1) {
      setStep(2);
      return;
    }
    if (step === 2) {
      // The illustration branch validates its own title on "Publier" (its own form state).
      if (!isIllus && !title.trim()) {
        setTitleError('Un titre est requis');
        return;
      }
      setStep(3);
    }
  }
  function goBack() {
    setStep((s) => (s > 1 ? ((s - 1) as Step) : s));
  }

  function buildBody(includeSoutien: boolean): CreateProjectRequest {
    const genreId = genres[0] ? resolveGenreId(genres[0]) : undefined;
    const themeIds = genres.slice(1).map((t) => resolveGenreId(t)).filter((id): id is string => !!id);
    const body: CreateProjectRequest = {
      type: type as ProjectType, // buildBody only runs for the manga/story branch (illustration posts to /illustrations)
      title: title.trim(),
      format,
      audienceRating: audience,
      visibility,
    };
    if (coverMediaId) body.cover = { mediaId: coverMediaId };
    if (synopsis.trim()) body.synopsis = synopsis.trim();
    if (hashtags.length) body.hashtags = hashtags;
    if (contestId) body.contestId = contestId;
    if (genreId) body.genre = genreId;
    if (themeIds.length) body.themes = themeIds;
    if (invites.length) body.invites = invites.map((m) => m.id);
    if (seeking.scenariste > 0 || seeking.dessinateur > 0) {
      body.seeking = { scenariste: seeking.scenariste, dessinateur: seeking.dessinateur };
    }
    if (includeSoutien) {
      Object.assign(body, soutienToRequest(soutien));
      if (members.length > 1) {
        body.revenueSplit = members.map((m) => ({ accountId: m.id, pct: split[m.id] ?? 0 }));
      }
    }
    return body;
  }

  async function submit(includeSoutien: boolean) {
    if (pending) return;
    if (!title.trim()) {
      setStep(2);
      setTitleError('Un titre est requis');
      return;
    }
    if (includeSoutien && !splitValid) return;
    setTitleError(null);
    setServerError(null);
    setPending(true);
    try {
      await createProject(buildBody(includeSoutien));
      router.push('/projets');
    } catch (err) {
      setServerError((err as ApiError).message ?? 'Une erreur est survenue. Réessayez.');
      setPending(false);
    }
  }

  const busy = pending || coverBusy;

  return (
    <div style={{ maxWidth: 740, margin: '0 auto', padding: '30px 20px 80px' }}>
      <div style={{ background: 'var(--card)', border: '3px solid var(--ink)', borderRadius: 12, overflow: 'hidden', boxShadow: '7px 7px 0 var(--shadow)' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', padding: '16px 20px', borderBottom: '3px solid var(--ink)' }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 400, textTransform: 'uppercase', margin: 0, lineHeight: 1 }}>
            Nouveau projet
          </h1>
          <button type="button" onClick={close} aria-label="Fermer" style={{ marginLeft: 'auto', background: 'none', border: 'none', fontSize: 18, color: 'var(--ink2)', cursor: 'pointer', padding: 4 }}>
            ✕
          </button>
        </div>

        {/* Step rail */}
        <nav aria-label="Étapes" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '15px 20px', borderBottom: '2px solid var(--border)', background: 'var(--paper)' }}>
          {steps.map((s, i) => (
            <div key={s.n} style={{ display: 'contents' }}>
              <button
                type="button"
                onClick={() => setStep(s.n)}
                aria-current={step === s.n ? 'step' : undefined}
                aria-label={`Étape ${s.n} : ${s.label}`}
                style={stepBtn}
              >
                <span
                  aria-hidden
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 26,
                    height: 26,
                    border: '2px solid var(--ink)',
                    borderRadius: '50%',
                    background: step === s.n ? 'var(--accent)' : 'var(--card)',
                    color: step === s.n ? '#fff' : 'var(--ink)',
                    fontSize: 13,
                  }}
                >
                  {s.n}
                </span>
                {s.label}
              </button>
              {i < steps.length - 1 && <span aria-hidden style={{ flex: 1, height: 2, background: 'var(--border)', minWidth: 14 }} />}
            </div>
          ))}
        </nav>

        <div style={{ padding: '20px 20px 22px' }}>
          {/* ── STEP 1 · TYPE ────────────────────────────────────────────── */}
          {step === 1 && (
            <>
              <div style={stepHeading}>1 · TYPE DE PROJET</div>
              <TypeCards type={type} onManga={() => setType('manga')} onStory={() => setType('story')} onIllustration={() => setType('illustration')} />
            </>
          )}

          {/* ── ILLUSTRATION BRANCH · the real publish flow, split Détails / Soutien ──
             One persistent instance across steps 2↔3 (kept mounted so its state survives the
             step switch); `section` toggles which part shows. */}
          {isIllus && step >= 2 && (
            <>
              <div style={stepHeading}>{step === 3 ? '3 · SOUTIEN · optionnel' : '2 · DÉTAILS'}</div>
              <PublishIllustrationForm
                ref={illusRef}
                embedded
                hideSubmit
                section={step === 3 ? 'soutien' : 'details'}
                onStatusChange={setIllusStatus}
              />
            </>
          )}

          {/* ── STEP 2 · DÉTAILS (manga / histoire) ──────────────────────── */}
          {step === 2 && !isIllus && (
            <>
              <div style={stepHeading}>2 · DÉTAILS</div>

              <div style={{ marginBottom: 14 }}>
                <label htmlFor="np-title" style={sectionLabel}>
                  Titre du projet
                </label>
                <input
                  id="np-title"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    if (titleError) setTitleError(null);
                  }}
                  maxLength={120}
                  placeholder="Titre du projet…"
                  aria-label="Titre du projet"
                  aria-invalid={!!titleError}
                  style={inputStyle}
                />
                {titleError && (
                  <p role="alert" style={errText}>
                    {titleError}
                  </p>
                )}
              </div>

              <div style={{ marginBottom: 14 }}>
                <label htmlFor="np-synopsis" style={sectionLabel}>
                  Synopsis
                </label>
                <textarea
                  id="np-synopsis"
                  value={synopsis}
                  onChange={(e) => setSynopsis(e.target.value)}
                  maxLength={2000}
                  placeholder="Résumez votre œuvre en quelques phrases…"
                  style={{ ...inputStyle, height: 92, resize: 'vertical', lineHeight: 1.6 }}
                />
              </div>

              <div style={{ marginBottom: 16 }}>
                <span style={sectionLabel} id="np-hashtags-label">
                  Hashtags <span style={{ fontWeight: 500, color: 'var(--ink2)' }}>· séparés par un espace</span>
                </span>
                <HashtagChipsInput value={hashtags} onChange={setHashtags} ariaLabel="Hashtags" placeholder="thriller noir urbain" />
              </div>

              <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap', marginBottom: 16, alignItems: 'flex-start' }}>
                <div>
                  <div style={sectionLabel}>Format</div>
                  <div role="group" aria-label="Format" style={{ display: 'flex', gap: 7 }}>
                    <button type="button" aria-pressed={format === 'serie'} onClick={() => setFormat('serie')} style={chip(format === 'serie')}>
                      Série{format === 'serie' ? ' ✓' : ''}
                    </button>
                    <button type="button" aria-pressed={format === 'oneshot'} onClick={() => setFormat('oneshot')} style={chip(format === 'oneshot')}>
                      One Shot{format === 'oneshot' ? ' ✓' : ''}
                    </button>
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <label htmlFor="np-contest" style={sectionLabel}>
                    Lier à un concours
                  </label>
                  <OnBrandSelect id="np-contest" value={contestId} onChange={(e) => setContestId(e.target.value)} aria-label="Lier à un concours" disabled={contestLoading}>
                    <option value="">Aucun concours</option>
                    {contest && (
                      <option value={contest.id}>
                        {contest.category} · {contest.title}
                      </option>
                    )}
                  </OnBrandSelect>
                  {!contestLoading && !contest && <p style={{ fontSize: 12, color: 'var(--ink2)', margin: '6px 0 0' }}>Aucun concours ouvert</p>}
                </div>
              </div>

              {/* Genres — one F-20 multi-select; the first chip is the primary genre (the badge).
                 Label is a block <div> (like "Public / Âge") so its marginBottom actually applies —
                 an inline <span> silently drops the vertical margin, which made the gap look off. */}
              <div style={{ marginBottom: 16 }}>
                <div style={sectionLabel} id="np-genres-label">
                  Genres <span style={{ fontWeight: 500, color: 'var(--ink2)' }}>· le 1ᵉʳ = genre principal</span>
                </div>
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
                  {genres.map((g) => (
                    <GenreChip key={g} label={g} onRemove={() => setGenres((cur) => cur.filter((x) => x !== g))} />
                  ))}
                  <GenreSuggestInput
                    key={genres.length}
                    ariaLabel="Ajouter un genre"
                    placeholder="＋ Ajouter"
                    onAdd={(fr) => setGenres((cur) => (cur.includes(fr) ? cur : [...cur, fr]))}
                    onCancel={() => {}}
                    onRemoveLast={() => setGenres((cur) => cur.slice(0, -1))}
                  />
                </div>
              </div>

              {/* Public / Âge */}
              <div style={{ marginBottom: 16 }}>
                <div style={sectionLabel}>Public / Âge</div>
                <div role="group" aria-label="Public / Âge" style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                  {CATALOG_AUDIENCE_RATINGS.map((r) => (
                    <button key={r} type="button" aria-pressed={audience === r} onClick={() => setAudience(r)} style={chip(audience === r)}>
                      {r}
                      {audience === r ? ' ✓' : ''}
                    </button>
                  ))}
                </div>
              </div>

              {/* Membres & invitations */}
              <div style={{ marginBottom: 18 }}>
                <div style={sectionLabel}>Membres &amp; invitations</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                  <span style={memberPill}>
                    <span aria-hidden style={avatarDisc(22)} />
                    Vous
                    <PenNibIcon size={13} />
                  </span>
                  {invites.map((m) => (
                    <span key={m.id} style={memberPill}>
                      <span aria-hidden style={avatarDisc(22)} />
                      {m.name}
                      <RoleGlyph role={m.role} size={13} />
                      <button type="button" aria-label={`Retirer ${m.name}`} onClick={() => removeInvite(m.id)} style={{ background: 'none', border: 'none', color: 'var(--ink2)', cursor: 'pointer', padding: '2px 4px', minHeight: 28, fontFamily: 'inherit' }}>
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
                <div style={{ border: '2px solid var(--ink)', borderRadius: 8, overflow: 'hidden' }}>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="⌕ Inviter par nom, rôle ou genre…"
                    aria-label="Inviter par nom, rôle ou genre"
                    style={{ ...inputStyle, border: 'none', borderRadius: 0, borderBottom: '2px solid var(--border)', background: 'var(--paper)', fontSize: 13 }}
                  />
                  {/* Hint under the searchbar: matching partners appear here as you type. */}
                  {!query.trim() && (
                    <div style={{ padding: '9px 11px', fontSize: 12, color: 'var(--ink2)', fontStyle: 'italic' }}>
                      Les partenaires correspondants s’afficheront ici.
                    </div>
                  )}
                  {query.trim() && (
                    <div>
                      {searchLoading && <div style={{ padding: '9px 11px', fontSize: 13, color: 'var(--ink2)' }}>Recherche…</div>}
                      {!searchLoading && suggestions.length === 0 && <div style={{ padding: '9px 11px', fontSize: 13, color: 'var(--ink2)' }}>Aucun résultat</div>}
                      {suggestions.map((p) => (
                        <div key={p.userId} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 11px', borderBottom: '1.5px solid var(--border)' }}>
                          <span aria-hidden style={avatarDisc(28)} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <b style={{ fontSize: 13 }}>{p.name}</b>{' '}
                            <span style={{ fontSize: 11, color: 'var(--ink2)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <RoleGlyph role={p.role} size={11} />
                              {roleLabel(p.role)}
                              {p.genreTags[0] ? ` · ${p.genreTags[0]}` : ''}
                            </span>
                          </div>
                          <button type="button" onClick={() => addInvite(p)} aria-label={`Ajouter ${p.name}`} style={{ ...accentBtn, padding: '4px 11px', minHeight: 36, fontSize: 12 }}>
                            ＋ Ajouter
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Je recherche + Visibilité */}
              <div style={{ display: 'flex', gap: 34, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 16 }}>
                <div style={{ minWidth: 250 }}>
                  <div style={sectionLabel}>Je recherche</div>
                  <div role="group" aria-label="Je recherche" style={{ display: 'flex', flexDirection: 'column', gap: 9, fontSize: 13, fontWeight: 500 }}>
                    <SeekingRow icon="scenariste" label="Scénariste(s)" aria="scénaristes" value={seeking.scenariste} onDec={() => bumpSeeking('scenariste', -1)} onInc={() => bumpSeeking('scenariste', 1)} />
                    <SeekingRow icon="dessinateur" label="Dessinateur·rice(s)" aria="dessinateur·rices" value={seeking.dessinateur} onDec={() => bumpSeeking('dessinateur', -1)} onInc={() => bumpSeeking('dessinateur', 1)} />
                  </div>
                </div>
                <div>
                  <div style={sectionLabel}>Visibilité</div>
                  <div role="radiogroup" aria-label="Visibilité" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {VISIBILITIES.map((v) => (
                      <button
                        key={v.value}
                        type="button"
                        role="radio"
                        aria-checked={visibility === v.value}
                        onClick={() => setVisibility(v.value)}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 500, color: 'var(--ink)', padding: '2px 0', minHeight: 28, textAlign: 'left' }}
                      >
                        <span aria-hidden>{visibility === v.value ? '●' : '○'}</span>
                        {v.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Couverture · optionnel (induced, F-10) */}
              <div>
                <div style={sectionLabel}>
                  Couverture <span style={{ fontWeight: 500, color: 'var(--ink2)' }}>· optionnel</span>
                </div>
                <UploadControl kind="cover" label="Déposez la couverture" frameHeight={COVER_FRAME_HEIGHT} onBusyChange={setCoverBusy} onUploaded={(m: MediaResponse) => setCoverMediaId(m.id)} />
              </div>
            </>
          )}

          {/* ── STEP 3 · SOUTIEN (manga / histoire — includes revenue split) ─ */}
          {!isIllus && step === 3 && (
            <>
              <div style={stepHeading}>
                3 · SOUTIEN — PALIERS &amp; PARTAGE DES REVENUS{' '}
                <span style={{ fontWeight: 500, color: 'var(--accent)', textTransform: 'none', letterSpacing: 0 }}>· optionnel</span>
              </div>
              <p style={{ fontSize: 13, color: 'var(--ink2)', margin: '0 0 15px', lineHeight: 1.5 }}>
                Les lecteur·rices soutiennent <b style={{ color: 'var(--ink)' }}>le projet</b> (abonnement mensuel ou don ponctuel). Les revenus sont ensuite répartis automatiquement entre les membres, selon les parts définies ci-dessous.
              </p>

              <SoutienFields value={soutien} onChange={setSoutien} />

              {/* Partage des revenus */}
              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 3 }}>
                  Partage des revenus <span style={{ fontWeight: 500, color: 'var(--ink2)' }}>· doit totaliser 100 %</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink2)', marginBottom: 11 }}>
                  Chaque membre retrouve automatiquement sa part sur son tableau de bord Revenus.
                </div>
                <div role="group" aria-label="Partage des revenus · doit totaliser 100 %" style={{ border: '2px solid var(--ink)', borderRadius: 8, overflow: 'hidden' }}>
                  {members.map((m, i) => (
                    <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 13px', borderBottom: i < members.length - 1 ? '2px solid var(--border)' : 'none' }}>
                      <span aria-hidden style={avatarDisc(38)} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <b style={{ fontSize: 14 }}>{m.name}</b>
                          <span style={{ fontSize: 12, color: 'var(--ink2)', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                            <RoleGlyph role={m.role} size={12} />
                            {roleLabel(m.role)}
                          </span>
                        </div>
                        <div style={{ height: 8, marginTop: 7, border: '2px solid var(--ink)', borderRadius: 5, overflow: 'hidden', background: 'var(--paper)' }}>
                          <div style={{ height: '100%', background: 'var(--accent)', width: `${split[m.id] ?? 0}%` }} />
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9, flex: 'none' }}>
                        <button type="button" aria-label={`Diminuer la part de ${m.name}`} disabled={members.length <= 1} onClick={() => bumpSplit(m.id, -5)} style={{ ...stepperBtn, background: 'var(--card)' }}>
                          −
                        </button>
                        <b style={{ fontFamily: 'var(--font-display)', fontSize: 22, minWidth: 58, textAlign: 'center' }}>{split[m.id] ?? 0} %</b>
                        <button type="button" aria-label={`Augmenter la part de ${m.name}`} disabled={members.length <= 1} onClick={() => bumpSplit(m.id, 5)} style={{ ...stepperBtn, background: 'var(--accent)', color: '#fff' }}>
                          ＋
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {!splitValid && (
                  <p role="alert" style={errText}>
                    Le partage des revenus doit totaliser 100 % (actuellement {splitTotal} %).
                  </p>
                )}
                <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 9 }}>
                  Modifiable plus tard dans les paramètres du projet, avec l’accord de tous les membres.
                </div>
              </div>
            </>
          )}

          {serverError && (
            <p role="alert" style={{ ...errText, marginTop: 14 }}>
              {serverError}
            </p>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '15px 20px', borderTop: '3px solid var(--ink)', background: 'var(--paper)', flexWrap: 'wrap' }}>
          {step > 1 && (
            <button type="button" onClick={goBack} style={footerBtn}>
              ← Retour
            </button>
          )}
          <button type="button" onClick={() => router.push('/projets')} style={footerBtn}>
            Annuler
          </button>
          <div style={{ flex: 1, minWidth: 8 }} />
          {!isIllus && step >= 2 && (
            <button type="button" onClick={() => void submit(false)} disabled={busy} style={{ ...footerBtn, opacity: busy ? 0.6 : 1 }}>
              Configurer plus tard
            </button>
          )}
          {/* Continuer advances both branches through Type → Détails → Soutien. On step 3 the manga
             branch shows "Créer le projet" and the illustration branch's embedded form owns "Publier". */}
          {(step === 1 || step === 2) && (
            <button type="button" onClick={goNext} style={accentBtn}>
              Continuer →
            </button>
          )}
          {!isIllus && step === 3 && (
            <button type="button" onClick={() => void submit(true)} disabled={busy || !splitValid} style={{ ...accentBtn, opacity: busy || !splitValid ? 0.6 : 1 }}>
              {pending ? 'Création…' : 'Créer le projet'}
            </button>
          )}
          {isIllus && step === 3 && (
            <button
              type="button"
              onClick={() => illusRef.current?.submit()}
              disabled={illusStatus.pending || illusStatus.uploadBusy}
              style={{ ...accentBtn, opacity: illusStatus.pending || illusStatus.uploadBusy ? 0.6 : 1 }}
            >
              {illusStatus.pending ? 'Publication…' : '✓ Publier'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const memberPill: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  background: 'var(--paper)',
  border: '2px solid var(--ink)',
  borderRadius: 999,
  padding: '3px 11px 3px 3px',
  fontSize: 13,
  fontWeight: 700,
};
const stepperBtn: React.CSSProperties = {
  width: 26,
  height: 26,
  minWidth: 26,
  border: '2px solid var(--ink)',
  borderRadius: 6,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  fontWeight: 700,
  fontFamily: 'inherit',
  color: 'var(--ink)',
};
function avatarDisc(size: number): React.CSSProperties {
  return {
    width: size,
    height: size,
    borderRadius: '50%',
    border: '2px solid var(--ink)',
    flex: 'none',
    backgroundColor: 'var(--tone)',
    backgroundImage: 'radial-gradient(var(--ink) 1.3px,transparent 1.4px)',
    backgroundSize: '5px 5px',
    display: 'inline-block',
  };
}

function SeekingRow({ icon, label, aria, value, onDec, onInc }: { icon: 'scenariste' | 'dessinateur'; label: string; aria: string; value: number; onDec: () => void; onInc: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <span aria-hidden style={{ width: 18, display: 'inline-flex', justifyContent: 'center' }}>
        {icon === 'dessinateur' ? <BrushIcon size={15} /> : <PenNibIcon size={15} />}
      </span>
      {label}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 9 }}>
        <button type="button" aria-label={`Moins de ${aria}`} onClick={onDec} style={stepperBtn}>
          −
        </button>
        <b data-testid={`seeking-${icon}`} style={{ minWidth: 14, textAlign: 'center' }}>
          {value}
        </b>
        <button type="button" aria-label={`Plus de ${aria}`} onClick={onInc} style={{ ...stepperBtn, background: 'var(--accent)', color: '#fff' }}>
          ＋
        </button>
      </div>
    </div>
  );
}

// Step 1 type cards — a radiogroup replica (proto 1760–1764). All three are single-select; the branch
// each opens differs (Illustration → the embedded publish flow). Roving tabindex + arrow-key selection.
function TypeCards({ type, onManga, onStory, onIllustration }: { type: WizardType; onManga: () => void; onStory: () => void; onIllustration: () => void }) {
  const cards = [
    { key: 'illustration' as const, title: 'Illustration(s)', desc: "Galerie d'images, sans récit.", selected: type === 'illustration', activate: onIllustration },
    { key: 'story' as const, title: 'Histoire (illustrée)', desc: "Texte, avec illustrations d'appui.", selected: type === 'story', activate: onStory },
    { key: 'manga' as const, title: 'Manga', desc: 'Récit dessiné : planches & chapitres.', selected: type === 'manga', activate: onManga },
  ];
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  // The tab-stop is the selected card (or the first when none is selected — Illustration is a nav, never selected).
  const focusIndex = cards.findIndex((c) => c.selected);
  const tabStop = focusIndex >= 0 ? focusIndex : 2;

  function onKeyDown(e: React.KeyboardEvent, i: number) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      const next = (i + 1) % cards.length;
      refs.current[next]?.focus();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = (i - 1 + cards.length) % cards.length;
      refs.current[prev]?.focus();
    } else if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      cards[i].activate();
    }
  }

  return (
    <div role="radiogroup" aria-label="Type de projet" className="ep-type-cards">
      {cards.map((c, i) => (
        <div
          key={c.key}
          ref={(el) => {
            refs.current[i] = el;
          }}
          role="radio"
          aria-checked={c.selected}
          aria-label={c.title}
          tabIndex={i === tabStop ? 0 : -1}
          onClick={c.activate}
          onKeyDown={(e) => onKeyDown(e, i)}
          style={{
            position: 'relative',
            border: `3px solid ${c.selected ? 'var(--accent)' : 'var(--ink)'}`,
            borderRadius: 8,
            padding: 13,
            background: c.selected ? 'var(--accent-soft)' : 'var(--card)',
            boxShadow: `3px 3px 0 ${c.selected ? 'var(--accent)' : 'var(--shadow)'}`,
            cursor: 'pointer',
          }}
        >
          {c.selected && (
            <span aria-hidden style={{ position: 'absolute', top: -10, right: -10, width: 24, height: 24, borderRadius: '50%', background: 'var(--accent)', color: '#fff', border: '2px solid var(--ink)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>
              ✓
            </span>
          )}
          <TypeGlyph kind={c.key} />
          <div style={{ fontWeight: 700, fontSize: 14 }}>{c.title}</div>
          <div style={{ fontSize: 11, color: 'var(--ink2)', lineHeight: 1.3, marginTop: 2 }}>{c.desc}</div>
        </div>
      ))}
    </div>
  );
}

// The three drawn glyph tiles (proto 1761–1763): a halftone slab, a page + text lines, a 2×2 panel grid.
function TypeGlyph({ kind }: { kind: 'illustration' | 'story' | 'manga' }) {
  const frame: React.CSSProperties = {
    height: 60,
    border: '2px solid var(--ink)',
    borderRadius: 5,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 9,
  };
  if (kind === 'illustration') {
    return (
      <div
        aria-hidden
        style={{
          ...frame,
          backgroundColor: 'var(--accent)',
          backgroundImage: 'radial-gradient(rgba(22,19,15,.5) 1.4px,transparent 1.5px),linear-gradient(150deg,var(--ink) 40%,var(--accent) 40%)',
          backgroundSize: 'var(--dot) var(--dot),cover',
        }}
      />
    );
  }
  if (kind === 'story') {
    return (
      <div aria-hidden style={{ ...frame, gap: 6, background: 'var(--paper)' }}>
        <div style={{ width: 24, height: 30, border: '2px solid var(--ink)', borderRadius: 2, backgroundColor: 'var(--accent)', backgroundImage: 'radial-gradient(rgba(22,19,15,.5) 1.2px,transparent 1.3px)', backgroundSize: '4px 4px' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width: 30 }}>
          <div style={{ height: 5, background: 'var(--ink)', borderRadius: 3 }} />
          <div style={{ height: 5, background: 'var(--ink)', borderRadius: 3 }} />
          <div style={{ height: 5, width: '60%', background: 'var(--ink)', borderRadius: 3 }} />
        </div>
      </div>
    );
  }
  return (
    <div aria-hidden style={{ ...frame, background: 'var(--card)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3, width: 44, height: 44 }}>
        <div style={{ border: '2px solid var(--ink)' }} />
        <div style={{ border: '2px solid var(--ink)' }} />
        <div style={{ border: '2px solid var(--ink)' }} />
        <div style={{ border: '2px solid var(--ink)' }} />
      </div>
    </div>
  );
}
