'use client';

// DR-12 FE-1 — minimal "Publier une illustration" form (interim CS-3 stand-in, see plan §1/D3).
// A single on-brand page: Titre (required), Illustration drop (F-10), Catégorie, Genres, Description,
// and the "Ajouter à une collection" multiselect (own collections + inline "＋ Nouvelle collection").
// CS-3 later replaces this with the full 4-step wizard (crop/planches/hashtags/outils/licence…).
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  GALLERY_CATEGORIES,
  GALLERY_CATEGORY_KEYS,
  resolveGenreId,
  type ActiveContest,
  type ApiError,
  type CollectionSummary,
  type GalleryCategoryKey,
  type MediaResponse,
  type PublishIllustrationRequest,
} from '@encre-et-plume/shared';
import { getActiveContest, getMyCollections, publishIllustration } from '../../lib/api';
import GenreChip from '../GenreChip';
import GenreSuggestInput from '../GenreSuggestInput';
import OnBrandSelect from '../form/OnBrandSelect';
import OnBrandMultiSelect from '../form/OnBrandMultiSelect';
import HashtagChipsInput from '../form/HashtagChipsInput';
import UploadControl from '../UploadControl';
import NewCollectionForm from '../collections/NewCollectionForm';
import SoutienFields, { EMPTY_SOUTIEN, soutienToRequest, type SoutienValue } from './SoutienFields';

const label: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--ink2)',
  letterSpacing: '.02em',
  display: 'block',
  marginBottom: 6,
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
const field = { marginBottom: 18 };
const errText: React.CSSProperties = { fontSize: 13, color: 'var(--accent)', fontWeight: 700, margin: '8px 0 0' };

export type PublishIllustrationHandle = { submit: () => void };

// `embedded` = rendered inside the CS-1 "Nouveau projet" wizard shell (the Illustration branch): drop
// the standalone page's outer frame + <h1> so the wizard's header/step-rail is the single frame.
// `section` splits the flow across wizard steps for consistency with the manga branch:
//   'details' = upload · titre · catégorie · genres · hashtags · description · collection · concours
//   'soutien' = the Soutien fields (revenue split is manga-only — a standalone illustration is single-author)
//   'all'     = one page (the form's own test) — every section + its own submit
// `hideSubmit` = the wizard footer owns the "Publier" button and triggers submit() via the ref.
const PublishIllustrationForm = forwardRef<PublishIllustrationHandle, {
  embedded?: boolean;
  section?: 'all' | 'details' | 'soutien';
  hideSubmit?: boolean;
  onStatusChange?: (s: { pending: boolean; uploadBusy: boolean }) => void;
}>(function PublishIllustrationForm({ embedded = false, section = 'all', hideSubmit = false, onStatusChange }, ref) {
  const router = useRouter();
  const showDetails = section !== 'soutien';
  const showPublish = section !== 'details'; // Soutien fields live here (with the submit unless hidden)

  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<GalleryCategoryKey>(GALLERY_CATEGORY_KEYS[0]);
  const [mediaId, setMediaId] = useState<string | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [genres, setGenres] = useState<string[]>([]); // canonical FR labels
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [description, setDescription] = useState('');

  const [myCollections, setMyCollections] = useState<CollectionSummary[]>([]);
  const [collectionIds, setCollectionIds] = useState<string[]>([]);
  const [newOpen, setNewOpen] = useState(false);

  // CS-1 induced additions: an optional contest link + a Soutien panel (paliers / dons / objectifs).
  const [contest, setContest] = useState<ActiveContest | null>(null);
  const [contestId, setContestId] = useState('');
  const [soutien, setSoutien] = useState<SoutienValue>(EMPTY_SOUTIEN);

  const [titleError, setTitleError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getMyCollections()
      .then((cs) => !cancelled && setMyCollections(cs))
      .catch(() => {});
    getActiveContest()
      .then((c) => !cancelled && setContest(c))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // FE-11 create-and-add: when routed from the manage picker (?collection=<id>), preselect that
  // collection so the newly published illustration lands as a member. Read from the URL directly
  // (client-only interactive form → no Suspense boundary needed for a search param).
  useEffect(() => {
    const cid = new URLSearchParams(window.location.search).get('collection');
    if (cid) setCollectionIds((cur) => (cur.includes(cid) ? cur : [...cur, cid]));
  }, []);

  const titleById = new Map(myCollections.map((c) => [c.id, c.title]));

  function addGenre(fr: string) {
    setGenres((cur) => (cur.includes(fr) ? cur : [...cur, fr]));
  }

  async function handleSubmit() {
    if (pending) return;
    if (!title.trim()) {
      setTitleError('Un titre est requis');
      return;
    }
    setTitleError(null);
    setServerError(null);

    const genreIds = genres.map((g) => resolveGenreId(g)).filter((id): id is string => !!id);
    const body: PublishIllustrationRequest = {
      title: title.trim(),
      category,
      ...(mediaId ? { mediaId } : {}),
      ...(genreIds.length ? { genres: genreIds } : {}),
      ...(hashtags.length ? { hashtags } : {}),
      ...(description.trim() ? { description: description.trim() } : {}),
      ...(collectionIds.length ? { collectionIds } : {}),
      ...(contestId ? { contestId } : {}),
      ...soutienToRequest(soutien),
    };

    setPending(true);
    try {
      const res = await publishIllustration(body);
      router.push('/illustration/' + res.id);
    } catch (err) {
      setServerError((err as ApiError).message ?? 'Une erreur est survenue. Réessayez.');
      setPending(false);
    }
  }

  useImperativeHandle(ref, () => ({ submit: () => void handleSubmit() }));

  // Report busy/pending up so the wizard footer's "Publier" button can reflect them.
  useEffect(() => {
    onStatusChange?.({ pending, uploadBusy });
  }, [pending, uploadBusy, onStatusChange]);

  return (
    <div style={embedded ? { padding: 0 } : { maxWidth: 640, margin: '0 auto', padding: '28px 28px 80px' }}>
      {!embedded && <h1 style={{ fontSize: 40, textTransform: 'uppercase', margin: '0 0 22px' }}>Publier une illustration</h1>}

      {/* Kept MOUNTED across wizard steps (hidden, not unmounted) so an in-flight UploadControl upload
          and its mediaId survive the Détails → Soutien step switch. */}
      <div style={{ display: showDetails ? undefined : 'none' }}>
      {/* Titre */}
      <div style={field}>
        <label htmlFor="pub-title" style={label}>
          Titre
        </label>
        <input
          id="pub-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          placeholder="Titre de l’illustration"
          style={inputStyle}
          aria-invalid={!!titleError}
          aria-label="Titre"
        />
        {titleError && (
          <p role="alert" style={errText}>
            {titleError}
          </p>
        )}
      </div>

      {/* Illustration (F-10) */}
      <div style={field}>
        <UploadControl
          kind="illustration"
          label="Déposez l’illustration"
          onBusyChange={setUploadBusy}
          onUploaded={(m: MediaResponse) => setMediaId(m.id)}
        />
      </div>

      {/* Catégorie */}
      <div style={field}>
        <label htmlFor="pub-category" style={label}>
          Catégorie
        </label>
        <OnBrandSelect
          id="pub-category"
          value={category}
          onChange={(e) => setCategory(e.target.value as GalleryCategoryKey)}
          aria-label="Catégorie"
        >
          {GALLERY_CATEGORIES.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </OnBrandSelect>
      </div>

      {/* Genres */}
      <div style={field}>
        <span style={label}>Genres</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {genres.map((g) => (
            <GenreChip key={g} label={g} onRemove={() => setGenres((cur) => cur.filter((x) => x !== g))} />
          ))}
          <GenreSuggestInput
            key={genres.length}
            ariaLabel="Ajouter un genre"
            placeholder="Ajouter…"
            onAdd={addGenre}
            onCancel={() => {}}
            onRemoveLast={() => setGenres((cur) => cur.slice(0, -1))}
          />
        </div>
      </div>

      {/* Hashtags (F-22) */}
      <div style={field}>
        <span style={label} id="pub-hashtags-label">Hashtags</span>
        <HashtagChipsInput value={hashtags} onChange={setHashtags} ariaLabel="Hashtags" />
      </div>

      {/* Description */}
      <div style={field}>
        <label htmlFor="pub-desc" style={label}>
          Description
        </label>
        <textarea
          id="pub-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={1000}
          rows={3}
          placeholder="Décrivez cette illustration…"
          style={{ ...inputStyle, resize: 'vertical' }}
        />
      </div>

      {/* Ajouter à une collection */}
      <div style={field}>
        <span style={label}>Ajouter à une collection</span>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <OnBrandMultiSelect
            label="Ajouter à une collection"
            options={myCollections.map((c) => ({ value: c.id, label: c.title }))}
            values={collectionIds}
            onChange={setCollectionIds}
          />
          <button
            type="button"
            onClick={() => setNewOpen(true)}
            style={{
              fontSize: 13,
              fontWeight: 700,
              border: '2px solid var(--ink)',
              borderRadius: 5,
              padding: '8px 13px',
              minHeight: 44,
              cursor: 'pointer',
              fontFamily: 'inherit',
              background: 'var(--accent)',
              color: '#fff',
              boxShadow: '2px 2px 0 var(--shadow)',
            }}
          >
            ＋ Nouvelle collection
          </button>
        </div>
        {/* Selected values as removable chips OUTSIDE the trigger (§ on-brand rule). */}
        {collectionIds.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
            {collectionIds.map((id) => (
              <GenreChip
                key={id}
                label={titleById.get(id) ?? id}
                onRemove={() => setCollectionIds((cur) => cur.filter((x) => x !== id))}
              />
            ))}
          </div>
        )}
      </div>

      {/* Lier à un concours (CS-1 induced) */}
      <div style={field}>
        <label htmlFor="pub-contest" style={label}>
          Lier à un concours
        </label>
        <OnBrandSelect id="pub-contest" value={contestId} onChange={(e) => setContestId(e.target.value)} aria-label="Lier à un concours">
          <option value="">Aucun concours</option>
          {contest && (
            <option value={contest.id}>
              {contest.category} · {contest.title}
            </option>
          )}
        </OnBrandSelect>
        {!contest && <p style={{ fontSize: 12, color: 'var(--ink2)', margin: '6px 0 0' }}>Aucun concours ouvert</p>}
      </div>

      {newOpen && (
        <NewCollectionForm
          onClose={() => setNewOpen(false)}
          onCreated={(summary) => {
            setMyCollections((cur) => [summary, ...cur]);
            setCollectionIds((cur) => [...cur, summary.id]);
          }}
        />
      )}
      </div>

      {showPublish && (
      <>
      {/* Soutien · optionnel (CS-1 induced). Embedded, the wizard's step heading titles this section,
          so drop the fieldset chrome to avoid a duplicate "Soutien · optionnel" heading. */}
      {embedded ? (
        <div style={{ marginBottom: 18 }}>
          <SoutienFields value={soutien} onChange={setSoutien} />
        </div>
      ) : (
        <fieldset style={{ border: '2px solid var(--ink)', borderRadius: 8, padding: '12px 14px', margin: '0 0 18px' }}>
          <legend style={{ fontSize: 12, fontWeight: 700, padding: '0 6px' }}>Soutien · optionnel</legend>
          <SoutienFields value={soutien} onChange={setSoutien} />
        </fieldset>
      )}

      {/* When Details lives on a prior wizard step, surface the required-title error here too. */}
      {!showDetails && titleError && (
        <p role="alert" style={{ ...errText, marginTop: 0, marginBottom: 12 }}>
          {titleError}
        </p>
      )}

      {serverError && (
        <p role="alert" style={{ ...errText, marginTop: 0, marginBottom: 12 }}>
          {serverError}
        </p>
      )}

      {!hideSubmit && (
        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={pending || uploadBusy}
          style={{
            fontSize: 15,
            fontWeight: 700,
            background: 'var(--accent)',
            color: '#fff',
            border: '3px solid var(--ink)',
            borderRadius: 8,
            padding: '12px 22px',
            minHeight: 44,
            cursor: 'pointer',
            boxShadow: '4px 4px 0 var(--shadow)',
            fontFamily: 'inherit',
            opacity: pending || uploadBusy ? 0.6 : 1,
          }}
        >
          {pending ? 'Publication…' : 'Publier'}
        </button>
      )}
      </>
      )}
    </div>
  );
});

export default PublishIllustrationForm;
