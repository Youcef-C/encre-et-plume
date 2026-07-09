'use client';

// DR-12 FE-5 — illustration-detail collections. Public: a "Collections" row of chips linking to each
// collection Œuvre. Owner-only: a "Modifier" panel (OnBrandMultiSelect of the artist's collections,
// pre-selected to the current membership, + "＋ Nouvelle collection"). Saving diffs the selection and
// issues the matching add/remove membership calls scoped to this illustration.
import { useState } from 'react';
import Link from 'next/link';
import type { AccountSummary, CollectionRef, CollectionSummary, IllustrationDetail } from '@encre-et-plume/shared';
import { addCollectionIllustration, getMyCollections, removeCollectionIllustration, updateIllustration } from '../../lib/api';
import GenreChip from '../GenreChip';
import OnBrandMultiSelect from '../form/OnBrandMultiSelect';
import HashtagChipsInput from '../form/HashtagChipsInput';
import NewCollectionForm from '../collections/NewCollectionForm';

const sameTags = (a: string[], b: string[]) => a.length === b.length && a.every((t, i) => t === b[i]);

export default function IllustrationCollections({
  detail,
  account,
  onHashtagsChange,
}: {
  detail: IllustrationDetail;
  account: AccountSummary | null;
  /** Lets the parent (IllustrationClient) refresh the displayed hashtag chips after an owner edit. */
  onHashtagsChange?: (hashtags: string[]) => void;
}) {
  const isOwner = !!account && account.id === detail.artist.id;

  const [collections, setCollections] = useState<CollectionRef[]>(detail.collections ?? []);
  const [editing, setEditing] = useState(false);
  const [mine, setMine] = useState<CollectionSummary[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [original, setOriginal] = useState<string[]>([]);
  const [hashtags, setHashtags] = useState<string[]>(detail.hashtags);
  const [originalHashtags, setOriginalHashtags] = useState<string[]>(detail.hashtags);
  const [newOpen, setNewOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  async function openEditor() {
    const cur = collections.map((c) => c.id);
    setSelected(cur);
    setOriginal(cur);
    setHashtags(detail.hashtags);
    setOriginalHashtags(detail.hashtags);
    setEditing(true);
    try {
      setMine(await getMyCollections());
    } catch {
      /* ponytail: transient — the panel still opens with the current chips */
    }
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    const added = selected.filter((id) => !original.includes(id));
    const removed = original.filter((id) => !selected.includes(id));
    try {
      await Promise.all([
        ...added.map((id) => addCollectionIllustration(id, detail.id)),
        ...removed.map((id) => removeCollectionIllustration(id, detail.id)),
      ]);
      // FE-9: persist the illustration's own hashtags only when they actually changed (the wrapper
      // now returns the full IllustrationDetail — re-render the chips from its `hashtags`).
      if (!sameTags(hashtags, originalHashtags)) {
        const res = await updateIllustration(detail.id, { hashtags });
        setHashtags(res.hashtags);
        setOriginalHashtags(res.hashtags);
        onHashtagsChange?.(res.hashtags);
      }
      // Rebuild the chip row from the selected collections (title/slug from the fetched list).
      const byId = new Map(mine.map((c) => [c.id, c]));
      setCollections(
        selected
          .map((id) => byId.get(id))
          .filter((c): c is CollectionSummary => !!c)
          .map((c) => ({ id: c.id, slug: c.slug, title: c.title })),
      );
      setEditing(false);
    } catch {
      /* ponytail: transient — leave the panel open so the user can retry */
    } finally {
      setSaving(false);
    }
  }

  const titleById = new Map(mine.map((c) => [c.id, c.title]));

  // A visitor on an illustration with no collections sees nothing (no empty label noise).
  if (!isOwner && collections.length === 0) return null;

  return (
    <div style={{ margin: '0 0 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: 'var(--ink2)' }}>COLLECTIONS</span>
        {isOwner && !editing && (
          <button
            type="button"
            onClick={() => void openEditor()}
            style={{ fontSize: 12, fontWeight: 700, border: '2px solid var(--ink)', borderRadius: 5, padding: '4px 10px', minHeight: 32, cursor: 'pointer', fontFamily: 'inherit', background: 'var(--card)', color: 'var(--ink)' }}
          >
            Modifier
          </button>
        )}
      </div>

      {collections.length > 0 ? (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {collections.map((c) => (
            <Link
              key={c.id}
              href={`/oeuvre/${c.slug}`}
              className="ep-tag-chip"
              style={{
                background: 'var(--paper)',
                border: '2px solid var(--ink)',
                borderRadius: 5,
                padding: '4px 10px',
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--ink)',
                textDecoration: 'none',
              }}
            >
              {c.title}
            </Link>
          ))}
        </div>
      ) : (
        !editing && <p style={{ fontSize: 13, color: 'var(--ink2)', margin: 0 }}>Aucune collection</p>
      )}

      {editing && (
        <div style={{ marginTop: 12, border: '2px solid var(--ink)', borderRadius: 8, padding: 14, background: 'var(--paper)' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 6 }}>
            Ajouter à une collection
          </span>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <OnBrandMultiSelect
              label="Ajouter à une collection"
              options={mine.map((c) => ({ value: c.id, label: c.title }))}
              values={selected}
              onChange={setSelected}
            />
            <button
              type="button"
              onClick={() => setNewOpen(true)}
              style={{ fontSize: 13, fontWeight: 700, border: '2px solid var(--ink)', borderRadius: 5, padding: '8px 13px', minHeight: 44, cursor: 'pointer', fontFamily: 'inherit', background: 'var(--card)', color: 'var(--ink)' }}
            >
              ＋ Nouvelle collection
            </button>
          </div>
          {selected.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
              {selected.map((id) => (
                <GenreChip
                  key={id}
                  label={titleById.get(id) ?? id}
                  onRemove={() => setSelected((cur) => cur.filter((x) => x !== id))}
                />
              ))}
            </div>
          )}

          {/* Hashtags (F-22) — the illustration's own hashtags, editable here (FE-9). */}
          <div style={{ marginTop: 14 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', display: 'block', marginBottom: 6 }}>Hashtags</span>
            <HashtagChipsInput value={hashtags} onChange={setHashtags} ariaLabel="Hashtags" />
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button type="button" onClick={() => setEditing(false)} style={{ fontSize: 13, fontWeight: 700, border: '2px solid var(--ink)', borderRadius: 6, padding: '7px 14px', minHeight: 40, cursor: 'pointer', fontFamily: 'inherit', background: 'var(--card)', color: 'var(--ink)' }}>
              Annuler
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving}
              style={{ fontSize: 13, fontWeight: 700, border: '2px solid var(--ink)', borderRadius: 6, padding: '7px 16px', minHeight: 40, cursor: 'pointer', fontFamily: 'inherit', background: 'var(--accent)', color: '#fff', boxShadow: '3px 3px 0 var(--shadow)', opacity: saving ? 0.6 : 1 }}
            >
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      )}

      {newOpen && (
        <NewCollectionForm
          onClose={() => setNewOpen(false)}
          onCreated={(summary) => {
            setMine((cur) => [summary, ...cur]);
            setSelected((cur) => [...cur, summary.id]);
          }}
        />
      )}
    </div>
  );
}
