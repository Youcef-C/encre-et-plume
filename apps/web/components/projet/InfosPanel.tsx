'use client';

// CS-2 INFOS — the project info editor. Replica of prototype data-projview="infos" plus the
// induced COVER drop (story note 2026-07-09: the drawn "Déposez la couverture" slot reused here via
// the F-10 UploadControl). Debounced field-level auto-save; the green ✓ banner doubles as the
// "Enregistré ✓" indicator. Reviews render read-only (moderation buttons are AD-5).
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  MediaResponse,
  ProjectWorkspaceResponse,
  UpdateProjectInfoRequest,
} from '@encre-et-plume/shared';
import UploadControl from '../UploadControl';
import { CheckIcon } from '../icons';
import { updateProjectInfo } from '../../lib/api';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

function normalizeHashtags(text: string): string[] {
  const seen = new Set<string>();
  for (const raw of text.split(/\s+/)) {
    const tag = raw.replace(/^#+/, '').toLowerCase().trim();
    if (tag) seen.add(tag);
  }
  return [...seen];
}

export interface InfosPanelProps {
  slug: string;
  workspace: ProjectWorkspaceResponse;
  readOnly?: boolean;
  /** Bubble a saved title up so the header stays in sync. */
  onTitleSaved?: (title: string) => void;
}

export default function InfosPanel({ slug, workspace, readOnly, onTitleSaved }: InfosPanelProps) {
  const [title, setTitle] = useState(workspace.title);
  const [synopsis, setSynopsis] = useState(workspace.synopsis);
  const [tagsText, setTagsText] = useState(workspace.hashtags.join(' '));
  const [collabOpen, setCollabOpen] = useState(workspace.collabOpen);
  const [cover, setCover] = useState<string | null>(workspace.cover);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  const pendingRef = useRef<UpdateProjectInfoRequest>({});
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = useCallback(async () => {
    const delta = pendingRef.current;
    pendingRef.current = {};
    if (Object.keys(delta).length === 0) return;
    setSaveState('saving');
    try {
      const res = await updateProjectInfo(slug, delta);
      setSaveState('saved');
      if (delta.title !== undefined) onTitleSaved?.(res.title);
      if (delta.cover !== undefined) setCover(res.cover);
    } catch {
      setSaveState('error');
    }
  }, [slug, onTitleSaved]);

  // Accumulate deltas; one PATCH per settled 600 ms burst.
  const schedule = useCallback(
    (delta: UpdateProjectInfoRequest) => {
      pendingRef.current = { ...pendingRef.current, ...delta };
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => void flush(), 600);
    },
    [flush],
  );

  // Same data-loss path CardModal fixed in R7-2: `flush` only ever ran from the debounce timer, so
  // an edit made inside the 600 ms window was thrown away when the panel went (switching tab or
  // navigating away unmounts it). Unmount now cancels the timer and runs the SAME flush — never a
  // second save path — and `flush` no-ops on an empty delta, so a debounce that already fired can't
  // double-save. `flush` is read from a ref because the cleanup runs once with a stale closure.
  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  });
  useEffect(
    () => () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
        void flushRef.current();
      }
    },
    [],
  );

  const chips = normalizeHashtags(tagsText);
  const reviews = workspace.reviews;
  const fmt = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : '—');

  return (
    <div style={{ padding: '16px 18px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 10,
          marginBottom: 16,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, textTransform: 'uppercase' }}>
          Informations du projet
        </div>
        <span style={{ fontSize: 13, color: 'var(--ink2)' }}>
          appliquées à la page publique &amp; au catalogue
        </span>
        {/* Transient auto-save readout — kept separate from the static banner below. */}
        <span
          aria-live="polite"
          style={{
            marginLeft: 'auto',
            fontSize: 12,
            fontWeight: 500,
            color: saveState === 'error' ? 'var(--accent)' : 'var(--ink2)',
          }}
        >
          {saveState === 'saving' && 'Enregistrement…'}
          {saveState === 'saved' && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              Enregistré
              <CheckIcon size={13} />
            </span>
          )}
          {saveState === 'error' && "L'enregistrement a échoué. Réessayez."}
        </span>
      </div>

      <div style={{ maxWidth: 620, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* COVER (induced deviation) — 240×330 on-brand frame with the F-10 drop control inside. */}
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', marginBottom: 6 }}>
            COUVERTURE
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div
              style={{
                width: 240,
                height: 330,
                flex: 'none',
                border: '3px solid var(--ink)',
                borderRadius: 10,
                boxShadow: '7px 7px 0 var(--shadow)',
                overflow: 'hidden',
                background: cover
                  ? undefined
                  : 'var(--paper) radial-gradient(var(--ink) 1.4px,transparent 1.5px) 0 0 / 6px 6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={cover}
                  alt="Couverture de l'œuvre"
                  width={240}
                  height={330}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink2)' }}>
                  Déposez la couverture
                </span>
              )}
            </div>
            {!readOnly && (
              <div style={{ flex: '1 1 240px', minWidth: 0 }}>
                <UploadControl
                  kind="cover"
                  label="Déposez la couverture"
                  onUploaded={(media: MediaResponse) => schedule({ cover: { mediaId: media.id } })}
                />
                {cover && (
                  <button
                    type="button"
                    onClick={() => schedule({ cover: null })}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: 'var(--ink2)',
                      fontSize: 13,
                      fontWeight: 700,
                      textDecoration: 'underline',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      padding: 0,
                    }}
                  >
                    Retirer la couverture
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* TITRE */}
        <div>
          <label htmlFor="proj-titre" style={fieldLabel}>
            TITRE
          </label>
          <input
            id="proj-titre"
            value={title}
            readOnly={readOnly}
            onChange={(e) => {
              const v = e.target.value;
              setTitle(v);
              if (readOnly) return;
              if (!v.trim()) {
                setTitleError('Un titre est requis');
                return;
              }
              setTitleError(null);
              schedule({ title: v.trim() });
            }}
            style={inputStyle}
          />
          {titleError && (
            <div role="alert" style={{ fontSize: 12, color: 'var(--accent)', marginTop: 5, fontWeight: 700 }}>
              {titleError}
            </div>
          )}
        </div>

        {/* SYNOPSIS */}
        <div>
          <label htmlFor="proj-synopsis" style={fieldLabel}>
            SYNOPSIS
          </label>
          <textarea
            id="proj-synopsis"
            value={synopsis}
            readOnly={readOnly}
            onChange={(e) => {
              setSynopsis(e.target.value);
              if (!readOnly) schedule({ synopsis: e.target.value });
            }}
            style={{ ...inputStyle, height: 110, lineHeight: 1.6, resize: 'none' }}
          />
        </div>

        {/* HASHTAGS */}
        <div>
          <label htmlFor="proj-tags" style={fieldLabel}>
            HASHTAGS <span style={{ fontWeight: 500 }}>· séparés par un espace</span>
          </label>
          <input
            id="proj-tags"
            value={tagsText}
            readOnly={readOnly}
            onChange={(e) => {
              setTagsText(e.target.value);
              if (!readOnly) schedule({ hashtags: normalizeHashtags(e.target.value) });
            }}
            style={inputStyle}
          />
          {chips.length > 0 && (
            <div
              style={{
                display: 'flex',
                gap: 6,
                flexWrap: 'wrap',
                marginTop: 9,
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {chips.map((tag) => (
                <span
                  key={tag}
                  style={{
                    background: 'var(--paper)',
                    border: '2px solid var(--ink)',
                    borderRadius: 5,
                    padding: '3px 10px',
                  }}
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Static info banner (proto line 1312) — does not change with save state. */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            border: '2px solid var(--ink)',
            borderRadius: 8,
            padding: '11px 13px',
            background: 'var(--paper)',
          }}
        >
          <span style={{ color: '#1f8a5b', display: 'inline-flex' }}>
            <CheckIcon size={16} />
          </span>
          <div style={{ fontSize: 13, color: 'var(--ink2)' }}>
            Les modifications sont enregistrées et appliquées automatiquement à la page de l&apos;œuvre.
          </div>
        </div>

        {/* Demandes de collaboration toggle */}
        <div
          style={{
            border: '2px solid var(--ink)',
            borderRadius: 8,
            padding: '13px 15px',
            background: 'var(--card)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 180 }}>
              <b style={{ fontSize: 14 }}>Demandes de collaboration</b>
              <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 2 }}>
                Autoriser les créateur·rices à candidater pour rejoindre ce projet.
              </div>
            </div>
            <button
              type="button"
              disabled={readOnly}
              aria-pressed={collabOpen}
              onClick={() => {
                const next = !collabOpen;
                setCollabOpen(next);
                schedule({ collabOpen: next });
              }}
              style={{
                flex: 'none',
                fontSize: 13,
                fontWeight: 700,
                border: '2px solid var(--ink)',
                borderRadius: 7,
                padding: '8px 14px',
                cursor: readOnly ? 'default' : 'pointer',
                fontFamily: 'inherit',
                background: collabOpen ? 'var(--accent)' : 'var(--card)',
                color: collabOpen ? '#fff' : 'var(--ink)',
                boxShadow: '2px 2px 0 var(--shadow)',
                minHeight: 36,
              }}
            >
              {collabOpen ? 'Ouvertes' : 'Fermées'}
            </button>
          </div>
        </div>
      </div>

      {/* Retours des lecteur·rices (read-only) */}
      <div
        style={{
          marginTop: 28,
          display: 'flex',
          alignItems: 'baseline',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, textTransform: 'uppercase' }}>
          Retours des lecteur·rices
        </div>
        <span style={{ fontSize: 13, color: 'var(--ink2)' }}>
          {reviews.summary.count} avis · lecture seule
        </span>
      </div>
      <div style={{ maxWidth: 620 }}>
        {reviews.summary.count === 0 ? (
          <div style={{ fontSize: 14, color: 'var(--ink2)', margin: '14px 0' }}>
            Aucun avis pour le moment.
          </div>
        ) : (
          <>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 18,
                flexWrap: 'wrap',
                border: '3px solid var(--ink)',
                borderRadius: 10,
                background: 'var(--paper)',
                boxShadow: '4px 4px 0 var(--shadow)',
                padding: '14px 18px',
                margin: '14px 0 16px',
              }}
            >
              <div style={{ textAlign: 'center' }}>
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 40,
                    lineHeight: 1,
                    color: 'var(--accent)',
                  }}
                >
                  {fmt(reviews.summary.overall)}
                </div>
                <div style={{ fontSize: 11, color: 'var(--ink2)', fontWeight: 700 }}>
                  /5 · note globale
                </div>
              </div>
              <div style={{ height: 44, width: 2, background: 'var(--border)' }} />
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  fontSize: 13,
                  fontWeight: 700,
                }}
              >
                <span style={{ color: 'var(--ink2)' }}>
                  Histoire <span style={{ color: 'var(--ink)' }}>{fmt(reviews.summary.story)}/5</span>
                </span>
                <span style={{ color: 'var(--ink2)' }}>
                  Dessin <span style={{ color: 'var(--ink)' }}>{fmt(reviews.summary.art)}/5</span>
                </span>
              </div>
              <span
                style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--ink2)', fontWeight: 700 }}
              >
                {reviews.summary.count} avis
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {reviews.items.map((a) => (
                <div
                  key={a.id}
                  style={{
                    border: '2px solid var(--ink)',
                    borderRadius: 8,
                    padding: '12px 14px',
                    background: 'var(--card)',
                    boxShadow: '2px 2px 0 var(--shadow)',
                  }}
                >
                  {a.hidden ? (
                    <span style={{ fontSize: 13, color: 'var(--ink2)', fontStyle: 'italic' }}>
                      Avis de <b style={{ fontStyle: 'normal' }}>{a.authorName}</b> masqué par la
                      modération.
                    </span>
                  ) : (
                    <>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 9,
                          marginBottom: 5,
                          flexWrap: 'wrap',
                        }}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: '50%',
                            background:
                              'var(--tone) radial-gradient(var(--ink) 1.4px,transparent 1.5px) 0 0 / 5px 5px',
                            border: '2px solid var(--ink)',
                            flex: 'none',
                          }}
                        />
                        <b style={{ fontSize: 14 }}>{a.authorName}</b>
                        <span style={{ fontSize: 11, color: 'var(--ink2)', fontWeight: 700 }}>
                          Histoire <span style={{ color: 'var(--accent)' }}>{a.storyRating}/5</span>
                        </span>
                        <span style={{ fontSize: 11, color: 'var(--ink2)', fontWeight: 700 }}>
                          Dessin <span style={{ color: 'var(--accent)' }}>{a.artRating}/5</span>
                        </span>
                      </div>
                      <div style={{ fontSize: 14, color: 'var(--ink)', lineHeight: 1.5 }}>{a.text}</div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const fieldLabel: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--ink2)',
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '2px solid var(--ink)',
  borderRadius: 8,
  padding: '10px 12px',
  fontSize: 15,
  fontFamily: 'inherit',
  background: 'var(--card)',
  color: 'var(--ink)',
  boxSizing: 'border-box',
};
