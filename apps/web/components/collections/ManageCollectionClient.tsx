'use client';

// DR-12 FE-4 — manage-collection view (Inferred screen; profile-edit / wizard patterns). Owner-only:
// edit infos (title/description/genres), set the cover (F-10 drop or promote a member), reorder
// members (↑/↓ with aria-live), add/remove members, edit contest + Soutien (thin config), and delete
// the collection (member illustrations survive). Every mutation goes through the DR-12 endpoints.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  resolveGenreId,
  type ActiveContest,
  type ApiError,
  type CollectionDetail,
  type GalleryIllustrationCard,
  type IllustrationDetail,
  type MediaResponse,
  type SoutienGoalInput,
  type SoutienTier,
  type UpdateCollectionRequest,
} from '@encre-et-plume/shared';
import * as api from '../../lib/api';
import { useSession } from '../../lib/session';
import { coverStyle, COVER_FRAME_HEIGHT } from '../../lib/cover';
import GenreChip from '../GenreChip';
import GenreSuggestInput from '../GenreSuggestInput';
import OnBrandSelect from '../form/OnBrandSelect';
import OnBrandCheckbox from '../form/OnBrandCheckbox';
import HashtagChipsInput from '../form/HashtagChipsInput';
import UploadControl from '../UploadControl';
import AddIllustrationsPicker from './AddIllustrationsPicker';
import EditIllustrationForm from '../illustration/EditIllustrationForm';

type State = 'loading' | 'ready' | 'notfound' | 'error';

const card: React.CSSProperties = {
  border: '3px solid var(--ink)',
  borderRadius: 10,
  boxShadow: '5px 5px 0 var(--shadow)',
  background: 'var(--card)',
  padding: 18,
  marginBottom: 22,
};
const label: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 6 };
const inputStyle: React.CSSProperties = {
  width: '100%', border: '2px solid var(--ink)', borderRadius: 8, padding: '10px 12px', fontSize: 14,
  fontFamily: 'inherit', background: 'var(--card)', color: 'var(--ink)', boxSizing: 'border-box',
};
// Layout-only base; color comes from .ep-btn-primary / .ep-btn-secondary / .ep-btn-danger(-outline).
const smallBtn: React.CSSProperties = {
  fontSize: 13, fontWeight: 700, border: '2px solid var(--ink)', borderRadius: 6, padding: '7px 12px',
  minHeight: 40, cursor: 'pointer', fontFamily: 'inherit',
};
const arrowBtn: React.CSSProperties = {
  width: 40, height: 40, flex: 'none', fontSize: 16, fontWeight: 700, lineHeight: 1,
  border: '2px solid var(--ink)', borderRadius: 6, background: 'var(--card)', color: 'var(--ink)',
  cursor: 'pointer', fontFamily: 'inherit',
};

function eurosToCents(v: string): number {
  const n = Number.parseFloat(v.replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
function centsToEuros(c: number): string {
  return c ? String(c / 100) : '';
}

export default function ManageCollectionClient({ id }: { id: string }) {
  const { account, loading: sessionLoading } = useSession();
  const router = useRouter();

  const [state, setState] = useState<State>('loading');
  const [detail, setDetail] = useState<CollectionDetail | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  // Editable infos
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [genres, setGenres] = useState<string[]>([]); // fr labels
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [contest, setContest] = useState<ActiveContest | null>(null);
  const [contestId, setContestId] = useState('');
  const [tiers, setTiers] = useState<{ name: string; euros: string }[]>([]);
  const [allowDonations, setAllowDonations] = useState(false);
  const [goals, setGoals] = useState<{ title: string; euros: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedNote, setSavedNote] = useState(false);

  const [mine, setMine] = useState<GalleryIllustrationCard[]>([]);
  const [reorderPending, setReorderPending] = useState(false);
  const [announce, setAnnounce] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [coverBusy, setCoverBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  // FE-14: per-member edit — fetch the full illustration, then open the shared EditIllustrationForm.
  const [editingIllus, setEditingIllus] = useState<IllustrationDetail | null>(null);
  const [memberLoadingId, setMemberLoadingId] = useState<string | null>(null);

  function seed(d: CollectionDetail) {
    setTitle(d.title);
    setDescription(d.description ?? '');
    setGenres(d.genres);
    setHashtags(d.hashtags);
    setContestId(d.contestId ?? '');
    setTiers((d.soutien?.tiers ?? []).map((t) => ({ name: t.name, euros: centsToEuros(t.priceCents) })));
    setAllowDonations(d.soutien?.allowDonations ?? false);
    setGoals((d.fundingGoals ?? []).map((g) => ({ title: g.title, euros: centsToEuros(g.targetCents) })));
  }

  useEffect(() => {
    if (sessionLoading) return;
    if (!account) {
      router.replace(`/connexion?next=/collection/${id}/gerer`);
      return;
    }
    let cancelled = false;
    setState('loading');
    api
      .getCollection(id)
      .then((d) => {
        if (cancelled) return;
        // Uniform "introuvable" for non-owners (no ownership leak, mirrors the server).
        if (d.owner.id !== account.id) {
          setState('notfound');
          return;
        }
        setDetail(d);
        seed(d);
        setState('ready');
      })
      .catch((err: ApiError) => {
        if (cancelled) return;
        setError(err);
        setState(err.statusCode === 404 ? 'notfound' : 'error');
      });
    return () => {
      cancelled = true;
    };
    // router is stable in Next.js; excluded so a fresh mock identity can't churn the fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, account, sessionLoading, retryKey]);

  useEffect(() => {
    if (state !== 'ready') return;
    api.getMyIllustrations().then(setMine).catch(() => setMine([]));
    api.getActiveContest().then(setContest).catch(() => {});
  }, [state]);

  const members = detail?.items ?? [];
  const memberIds = new Set(members.map((m) => m.id));
  const addable = mine.filter((m) => !memberIds.has(m.id));

  async function reorder(from: number, to: number) {
    if (!detail || reorderPending || to < 0 || to >= members.length) return;
    const ids = members.map((m) => m.id);
    const [moved] = ids.splice(from, 1);
    ids.splice(to, 0, moved);
    setReorderPending(true);
    setAnnounce('');
    try {
      const updated = await api.reorderCollection(detail.id, ids);
      setDetail(updated);
      setAnnounce('Ordre mis à jour');
    } catch {
      setAnnounce('La réorganisation a échoué. Réessayez.');
    } finally {
      setReorderPending(false);
    }
  }

  async function removeMember(illustrationId: string) {
    if (!detail) return;
    try {
      await api.removeCollectionIllustration(detail.id, illustrationId);
      const fresh = await api.getCollection(detail.id);
      setDetail(fresh);
    } catch {
      /* ponytail: transient — the list re-syncs on the next load */
    }
  }

  async function promoteMemberCover(illustrationId: string) {
    if (!detail) return;
    try {
      const updated = await api.updateCollection(detail.id, { cover: { illustrationId } });
      setDetail(updated);
    } catch {
      /* ponytail: transient */
    }
  }

  // FE-14: open the shared edit form for a member (rows only carry CollectionItemDto — fetch the full
  // illustration first). A member saved "Privée" stays listed (owner surface, per BE-9 rule 4).
  async function openMemberEdit(illustrationId: string) {
    if (memberLoadingId) return;
    setMemberLoadingId(illustrationId);
    try {
      setEditingIllus(await api.getIllustration(illustrationId));
    } catch {
      /* ponytail: transient — the button re-enables, the user can retry */
    } finally {
      setMemberLoadingId(null);
    }
  }

  function onMemberSaved(updated: IllustrationDetail) {
    // Reflect the edit in the member grid without a full collection re-fetch.
    setDetail((d) =>
      d
        ? {
            ...d,
            items: d.items.map((it) =>
              it.id === updated.id
                ? { ...it, title: updated.title, category: updated.category, categoryLabel: updated.categoryLabel }
                : it,
            ),
          }
        : d,
    );
    setEditingIllus(null);
  }

  async function saveInfos() {
    if (!detail || saving) return;
    setSaving(true);
    setSavedNote(false);
    const genreIds = genres.map((g) => resolveGenreId(g)).filter((id2): id2 is string => !!id2);
    const tiersBody: SoutienTier[] = tiers.filter((t) => t.name.trim()).map((t) => ({ name: t.name.trim(), priceCents: eurosToCents(t.euros) }));
    const goalsBody: SoutienGoalInput[] = goals.filter((g) => g.title.trim()).map((g) => ({ title: g.title.trim(), targetCents: eurosToCents(g.euros) }));
    const body: UpdateCollectionRequest = {
      title: title.trim(),
      description: description.trim() || null,
      genres: genreIds,
      hashtags,
      contestId: contestId || null,
      tiers: tiersBody,
      allowDonations,
      goals: goalsBody,
    };
    try {
      const updated = await api.updateCollection(detail.id, body);
      setDetail(updated);
      seed(updated);
      setSavedNote(true);
    } catch {
      /* ponytail: transient */
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!detail) return;
    setDeleting(true);
    try {
      await api.deleteCollection(detail.id);
      router.push(`/${detail.owner.slug ?? ''}`);
    } catch {
      setDeleting(false);
    }
  }

  if (state === 'loading') {
    return (
      <div role="status" aria-label="Chargement de la collection…" className="ep-skeleton-delayed" style={{ maxWidth: 820, margin: '0 auto', padding: '28px' }}>
        <div aria-hidden="true" style={{ height: 40, width: '55%', background: 'var(--tone)', opacity: 0.5, borderRadius: 4, marginBottom: 20 }} />
        <div aria-hidden="true" style={{ height: 160, background: 'var(--tone)', opacity: 0.4, borderRadius: 8 }} />
      </div>
    );
  }

  if (state === 'notfound') {
    return (
      <div style={{ maxWidth: 820, margin: '0 auto', padding: '60px 28px', textAlign: 'center' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(28px, 5vw, 44px)', textTransform: 'uppercase', margin: '0 0 12px' }}>
          Collection introuvable
        </h1>
        <Link href="/galerie" style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink2)' }}>
          ‹ Galerie
        </Link>
      </div>
    );
  }

  if (state === 'error' || !detail) {
    return (
      <div role="alert" style={{ maxWidth: 820, margin: '0 auto', padding: '60px 28px', textAlign: 'center' }}>
        <p style={{ color: 'var(--accent)', fontWeight: 600, marginBottom: 12 }}>{error?.message ?? 'Impossible de charger cette collection.'}</p>
        <button type="button" onClick={() => setRetryKey((k) => k + 1)} className="ep-btn-primary" style={smallBtn}>
          Réessayer
        </button>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: '28px 28px 80px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap', marginBottom: 22 }}>
        <h1 style={{ fontSize: 36, textTransform: 'uppercase', margin: 0 }}>{detail.title}</h1>
        <span style={{ fontSize: 14, color: 'var(--ink2)', fontWeight: 500 }}>{detail.count} illustration{detail.count === 1 ? '' : 's'} · collection</span>
        <Link href={`/oeuvre/${detail.slug}`} style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>
          Voir l’œuvre →
        </Link>
      </div>

      {/* Infos */}
      <section style={card}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, textTransform: 'uppercase', margin: '0 0 14px' }}>Infos</h2>
        <div style={{ marginBottom: 14 }}>
          <label htmlFor="mc-title" style={label}>Titre</label>
          <input id="mc-title" value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} aria-label="Titre" />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label htmlFor="mc-desc" style={label}>Description</label>
          <textarea id="mc-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <span style={label}>Genres</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {genres.map((g) => (
              <GenreChip key={g} label={g} onRemove={() => setGenres((cur) => cur.filter((x) => x !== g))} />
            ))}
            <GenreSuggestInput
              key={genres.length}
              ariaLabel="Ajouter un genre"
              placeholder="Ajouter…"
              onAdd={(fr) => setGenres((cur) => (cur.includes(fr) ? cur : [...cur, fr]))}
              onCancel={() => {}}
              onRemoveLast={() => setGenres((cur) => cur.slice(0, -1))}
            />
          </div>
        </div>

        {/* Hashtags (F-22) */}
        <div style={{ marginBottom: 14 }}>
          <span style={label}>Hashtags</span>
          <HashtagChipsInput value={hashtags} onChange={setHashtags} ariaLabel="Hashtags" />
        </div>

        {/* Concours */}
        <div style={{ marginBottom: 14 }}>
          <label htmlFor="mc-contest" style={label}>Lié à un concours</label>
          <OnBrandSelect id="mc-contest" value={contestId} onChange={(e) => setContestId(e.target.value)} aria-label="Lié à un concours">
            <option value="">Aucun concours</option>
            {contest && <option value={contest.id}>{contest.category} · {contest.title}</option>}
            {/* keep the currently-linked contest selectable even if it's no longer the active one */}
            {contestId && (!contest || contest.id !== contestId) && <option value={contestId}>Concours lié</option>}
          </OnBrandSelect>
        </div>

        {/* Soutien (thin config) */}
        <fieldset style={{ border: '2px solid var(--ink)', borderRadius: 8, padding: '12px 14px', margin: '0 0 14px' }}>
          <legend style={{ fontSize: 12, fontWeight: 700, padding: '0 6px' }}>Soutien · optionnel</legend>
          <span style={label}>Paliers d’abonnement</span>
          {tiers.map((t, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              <input aria-label={`Nom du palier ${i + 1}`} value={t.name} onChange={(e) => setTiers((cur) => cur.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Nom du palier" style={{ ...inputStyle, flex: 2, minWidth: 120 }} />
              <input aria-label={`Prix mensuel du palier ${i + 1} (€)`} type="number" min={0} step="0.5" value={t.euros} onChange={(e) => setTiers((cur) => cur.map((x, j) => (j === i ? { ...x, euros: e.target.value } : x)))} placeholder="€/mois" style={{ ...inputStyle, flex: 1, minWidth: 90 }} />
              <button type="button" aria-label={`Retirer le palier ${i + 1}`} onClick={() => setTiers((cur) => cur.filter((_, j) => j !== i))} className="ep-btn-secondary" style={smallBtn}>✕</button>
            </div>
          ))}
          <button type="button" onClick={() => setTiers((cur) => [...cur, { name: '', euros: '' }])} className="ep-btn-secondary" style={{ ...smallBtn, marginBottom: 12 }}>＋ Ajouter un palier</button>
          <div style={{ marginBottom: 12 }}>
            <OnBrandCheckbox label="Autoriser les dons uniques" checked={allowDonations} onChange={(e) => setAllowDonations(e.target.checked)} style={{ fontWeight: 700 }} />
          </div>
          <span style={label}>Objectifs de financement</span>
          {goals.map((g, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              <input aria-label={`Titre de l’objectif ${i + 1}`} value={g.title} onChange={(e) => setGoals((cur) => cur.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} placeholder="Objectif" style={{ ...inputStyle, flex: 2, minWidth: 120 }} />
              <input aria-label={`Cible de l’objectif ${i + 1} (€)`} type="number" min={0} step="1" value={g.euros} onChange={(e) => setGoals((cur) => cur.map((x, j) => (j === i ? { ...x, euros: e.target.value } : x)))} placeholder="Cible €" style={{ ...inputStyle, flex: 1, minWidth: 90 }} />
              <button type="button" aria-label={`Retirer l’objectif ${i + 1}`} onClick={() => setGoals((cur) => cur.filter((_, j) => j !== i))} className="ep-btn-secondary" style={smallBtn}>✕</button>
            </div>
          ))}
          <button type="button" onClick={() => setGoals((cur) => [...cur, { title: '', euros: '' }])} className="ep-btn-secondary" style={smallBtn}>＋ Ajouter un objectif</button>
        </fieldset>

        {/* Task C: the info fields are local state committed only here — "Sauvegarder" persists,
            "Annuler" discards by re-seeding the last-saved values from `detail`. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => void saveInfos()}
            disabled={saving}
            className="ep-btn-primary"
            style={{ ...smallBtn, opacity: saving ? 0.6 : 1 }}
          >
            {saving ? 'Enregistrement…' : 'Sauvegarder'}
          </button>
          <button
            type="button"
            onClick={() => { seed(detail); setSavedNote(false); }}
            disabled={saving}
            className="ep-btn-secondary"
            style={smallBtn}
          >
            Annuler
          </button>
          {savedNote && (
            <span role="status" style={{ fontSize: 13, color: 'var(--ink2)', fontWeight: 700 }}>Enregistré</span>
          )}
        </div>
      </section>

      {/* Couverture */}
      <section style={card}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, textTransform: 'uppercase', margin: '0 0 14px' }}>Couverture</h2>
        {/* FE-15: no separate preview box — UploadControl's persistent drop box + its own side preview
            (seeded from `currentUrl`, re-keyed on the current cover so promoting a member updates it)
            are the one consistent frame (D23, supersedes the FE-10 two-box markup). */}
        <UploadControl
          key={detail.cover ?? 'none'}
          kind="cover"
          label="Déposez la couverture"
          currentUrl={detail.cover}
          frameHeight={COVER_FRAME_HEIGHT}
          hideLabel
          onBusyChange={setCoverBusy}
          onUploaded={async (m: MediaResponse) => {
            // BE-8 cover-as-member: the upload creates a "Couverture" member at order 0 and the
            // returned detail carries the incremented count + reordered grid — commit it as-is.
            const updated = await api.updateCollection(detail.id, { cover: { mediaId: m.id } });
            setDetail(updated);
          }}
        />
        {coverBusy && <p style={{ fontSize: 12, color: 'var(--ink2)' }}>Optimisation en cours…</p>}
      </section>

      {/* Membres */}
      <section style={card}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, textTransform: 'uppercase', margin: '0 0 14px' }}>Membres</h2>
        <div role="status" aria-live="polite" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)', whiteSpace: 'nowrap' }}>
          {announce}
        </div>
        {members.length === 0 ? (
          <p style={{ color: 'var(--ink2)', fontSize: 15 }}>Aucune illustration</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {members.map((m, i) => (
              <li key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 12, border: '2px solid var(--ink)', borderRadius: 8, padding: '8px 10px', flexWrap: 'wrap' }}>
                <span aria-hidden="true" style={{ width: 44, height: 44, flex: 'none', border: '2px solid var(--ink)', borderRadius: 6, overflow: 'hidden', ...coverStyle(m.id, m.thumbnail) }} />
                <b style={{ fontSize: 14, flex: 1, minWidth: 120 }}>{m.title}</b>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button type="button" aria-label={`Monter ${m.title}`} onClick={() => void reorder(i, i - 1)} disabled={reorderPending || i === 0} style={{ ...arrowBtn, opacity: reorderPending || i === 0 ? 0.5 : 1 }}>↑</button>
                  <button type="button" aria-label={`Descendre ${m.title}`} onClick={() => void reorder(i, i + 1)} disabled={reorderPending || i === members.length - 1} style={{ ...arrowBtn, opacity: reorderPending || i === members.length - 1 ? 0.5 : 1 }}>↓</button>
                  <button type="button" onClick={() => void promoteMemberCover(m.id)} className="ep-btn-secondary" style={smallBtn}>Utiliser comme couverture</button>
                  <button type="button" aria-label={`Modifier ${m.title}`} onClick={() => void openMemberEdit(m.id)} disabled={memberLoadingId === m.id} className="ep-btn-secondary" style={{ ...smallBtn, opacity: memberLoadingId === m.id ? 0.6 : 1 }}>
                    {memberLoadingId === m.id ? 'Chargement…' : 'Modifier'}
                  </button>
                  <button type="button" aria-label={`Retirer ${m.title}`} onClick={() => void removeMember(m.id)} className="ep-btn-danger-outline" style={{ ...smallBtn, borderColor: 'var(--danger)' }}>Retirer</button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Add picker (FE-11, D18 — replaces the round-1 inline one-at-a-time add rows). */}
        <div style={{ marginTop: 18 }}>
          <button type="button" onClick={() => setPickerOpen(true)} className="ep-btn-primary" style={smallBtn}>
            ＋ Ajouter des illustrations
          </button>
        </div>
      </section>

      {pickerOpen && (
        <AddIllustrationsPicker
          collectionId={detail.id}
          illustrations={addable}
          onClose={() => setPickerOpen(false)}
          onCommitted={(updated) => setDetail(updated)}
        />
      )}

      {editingIllus && (
        <EditIllustrationForm
          detail={editingIllus}
          onSaved={onMemberSaved}
          onClose={() => setEditingIllus(null)}
        />
      )}

      {/* Danger zone */}
      <section style={{ ...card, borderColor: 'var(--accent)' }}>
        {!confirmDelete ? (
          <button type="button" onClick={() => setConfirmDelete(true)} className="ep-btn-danger-outline" style={{ ...smallBtn, borderColor: 'var(--danger)' }}>
            Supprimer la collection
          </button>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 500 }}>Les illustrations ne seront pas supprimées.</span>
            <button type="button" onClick={() => setConfirmDelete(false)} disabled={deleting} className="ep-btn-secondary" style={smallBtn}>Annuler</button>
            <button type="button" onClick={() => void handleDelete()} disabled={deleting} className="ep-btn-danger" style={smallBtn}>
              {deleting ? 'Suppression…' : 'Oui, supprimer'}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
