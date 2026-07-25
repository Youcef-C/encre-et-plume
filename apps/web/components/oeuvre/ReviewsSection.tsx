'use client';

// DR-3 FE-6 — "Avis des lecteur·rices" (PUB-3 read-only display). Replica of ŒUVRE lines 912-932.
// The "Laisser un avis" form is a replica; submit is a stub (PUB-3 owns the real write path).
import { useState } from 'react';
import type { WorkDetail, WorkReviewDto, AccountSummary } from '@encre-et-plume/shared';
import { ratingLabel } from '../../lib/work';
import { usePersonalAction } from '../../lib/usePersonalAction';
import { createBlock } from '../../lib/api';
import OverflowMenu, { MenuItem } from '../OverflowMenu';
import { StarIcon } from '../icons';

function StarPicker({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ width: 62, fontSize: 12, fontWeight: 700, color: 'var(--ink2)' }}>{label}</span>
      <div role="radiogroup" aria-label={label} style={{ display: 'flex', gap: 4 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={n === value}
            aria-label={`${n} étoile${n > 1 ? 's' : ''}`}
            onClick={() => onChange(n)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 0,
              color: n <= value ? 'var(--accent)' : 'var(--tone)',
              fontFamily: 'inherit',
            }}
          >
            <StarIcon size={20} />
          </button>
        ))}
      </div>
      <span style={{ fontSize: 12, color: 'var(--ink2)', fontWeight: 700 }}>{value}/5</span>
    </div>
  );
}

export default function ReviewsSection({ work, account }: { work: WorkDetail; account: AccountSummary | null }) {
  const { trigger, notice } = usePersonalAction(account);
  const [storyRating, setStoryRating] = useState(0);
  const [artRating, setArtRating] = useState(0);
  const [draft, setDraft] = useState('');
  // MC-10 F7 — mute (masquer) rides the review rows since PUB-2 comments are stubbed (deviation D2).
  const [reviews, setReviews] = useState<WorkReviewDto[]>(work.reviews);
  const [muteNotice, setMuteNotice] = useState<string | null>(null);

  // The lighter "mute" option — no confirm modal (story calls it the lighter action). On success
  // the server already omits that author for this viewer on the next read; hide their rows now.
  function muteAuthor(review: WorkReviewDto) {
    if (!review.authorId) return;
    const authorId = review.authorId;
    void createBlock({ userId: authorId, kind: 'mute' })
      .then(() => {
        setReviews((prev) => prev.filter((r) => r.authorId !== authorId));
        setMuteNotice('Commentaires masqués.');
      })
      .catch(() => setMuteNotice('Impossible de masquer ce compte. Réessayez.'));
  }

  return (
    <div>
      <h2 style={{ fontSize: 24, textTransform: 'uppercase', margin: '0 0 12px' }}>Avis des lecteur·rices</h2>

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
          marginBottom: 16,
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 42, lineHeight: 1, color: 'var(--accent)' }}>
            {ratingLabel(work.ratingAvg)}
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink2)', fontWeight: 700 }}>/5 · note globale</div>
        </div>
        <div style={{ height: 46, width: 2, background: 'var(--border)' }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, fontWeight: 700 }}>
          <span style={{ color: 'var(--ink2)' }}>
            Histoire <span style={{ color: 'var(--ink)' }}>{ratingLabel(work.ratingStoryAvg)}/5</span>
          </span>
          <span style={{ color: 'var(--ink2)' }}>
            Dessin <span style={{ color: 'var(--ink)' }}>{ratingLabel(work.ratingArtAvg)}/5</span>
          </span>
        </div>
        <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--ink2)', fontWeight: 700 }}>
          {work.reviewCount} avis
        </span>
      </div>

      <div
        style={{
          border: '3px solid var(--ink)',
          borderRadius: 10,
          background: 'var(--card)',
          boxShadow: '4px 4px 0 var(--shadow)',
          padding: '14px 16px',
          marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 9 }}>Laisser un avis</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 11 }}>
          <StarPicker label="Histoire" value={storyRating} onChange={setStoryRating} />
          <StarPicker label="Dessin" value={artRating} onChange={setArtRating} />
        </div>
        <label htmlFor="oeuvre-avis-draft" className="ep-label" style={{ display: 'none' }}>
          Votre avis
        </label>
        <textarea
          id="oeuvre-avis-draft"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Partagez votre ressenti sur l'œuvre…"
          style={{
            width: '100%',
            height: 74,
            border: '2px solid var(--ink)',
            borderRadius: 8,
            padding: '10px 12px',
            fontSize: 14,
            fontFamily: 'inherit',
            lineHeight: 1.5,
            background: 'var(--card)',
            color: 'var(--ink)',
            boxSizing: 'border-box',
            resize: 'none',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
          <button
            type="button"
            onClick={trigger}
            className="ep-btn-primary"
            style={{
              fontSize: 13,
              fontWeight: 700,
              border: '2px solid var(--ink)',
              padding: '8px 18px',
              cursor: 'pointer',
              boxShadow: '2px 2px 0 var(--shadow)',
              fontFamily: 'inherit',
            }}
          >
            Publier mon avis
          </button>
        </div>
        {notice && (
          <p role="status" style={{ marginTop: 8, fontSize: 12, color: 'var(--ink2)', fontWeight: 700, textAlign: 'right' }}>
            Bientôt disponible
          </p>
        )}
      </div>

      {muteNotice && (
        <p role="status" style={{ fontSize: 12, color: 'var(--ink2)', fontWeight: 700, margin: '0 0 12px' }}>
          {muteNotice}
        </p>
      )}

      {reviews.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {reviews.map((review) => {
            // Mute is offered on other people's authored (non-null id) reviews to a signed-in viewer.
            const canMute = Boolean(account) && !!review.authorId && review.authorId !== account?.id && !review.hidden;
            return (
              <div
                key={review.id}
                style={{
                  border: '2px solid var(--ink)',
                  borderRadius: 8,
                  padding: '12px 14px',
                  background: 'var(--card)',
                  boxShadow: '2px 2px 0 var(--shadow)',
                }}
              >
                {review.hidden ? (
                  <p style={{ fontSize: 13, color: 'var(--ink2)', fontStyle: 'italic', margin: 0 }}>
                    Avis de <b style={{ fontStyle: 'normal' }}>{review.authorName}</b> masqué par la modération.
                  </p>
                ) : (
                  <>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 5, flexWrap: 'wrap' }}>
                      <span
                        aria-hidden="true"
                        style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--tone)', border: '2px solid var(--ink)', flex: 'none' }}
                      />
                      <b style={{ fontSize: 14 }}>{review.authorName}</b>
                      <span style={{ fontSize: 11, color: 'var(--ink2)', fontWeight: 700 }}>
                        Histoire <span style={{ color: 'var(--accent)' }}>{review.storyRating}/5</span>
                      </span>
                      <span style={{ fontSize: 11, color: 'var(--ink2)', fontWeight: 700 }}>
                        Dessin <span style={{ color: 'var(--accent)' }}>{review.artRating}/5</span>
                      </span>
                      {canMute && (
                        <span style={{ marginLeft: 'auto' }}>
                          <OverflowMenu
                            label={`Actions sur l'avis de ${review.authorName}`}
                            width={260}
                            triggerStyle={{ minWidth: 36, minHeight: 36, padding: '4px 10px', fontSize: 15 }}
                          >
                            {(close) => (
                              <MenuItem
                                accent
                                onClick={() => {
                                  close();
                                  muteAuthor(review);
                                }}
                              >
                                Masquer les commentaires de ce compte
                              </MenuItem>
                            )}
                          </OverflowMenu>
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 14, color: 'var(--ink)', lineHeight: 1.5 }}>{review.text}</div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
