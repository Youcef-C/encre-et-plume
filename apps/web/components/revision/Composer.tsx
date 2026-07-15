'use client';

// CS-5 — dessin correction composer (prototype aside footer, line 1684). Iter 6 (A1/A2): the composer
// is ALWAYS active (no "Nouvelle correction" toggle) and dessin is the only type here, so the Scénario/
// Dessin "type" row is gone. A correction needs BOTH a drawn region (area) and a description to submit.
import { useState } from 'react';
import type { DessinRegion } from '@encre-et-plume/shared';

export interface ComposerProps {
  draftRegion: DessinRegion | null;
  onClearRegion: () => void;
  onSubmit: (description: string) => void | Promise<void>;
  busy: boolean;
  error?: string | null;
}

export default function Composer({ draftRegion, onClearRegion, onSubmit, busy, error }: ComposerProps) {
  const [text, setText] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) {
      setLocalError('Description requise');
      return;
    }
    if (!draftRegion) {
      setLocalError('Tracez d’abord un cadre sur l’image');
      return;
    }
    setLocalError(null);
    void Promise.resolve(onSubmit(trimmed)).then(() => setText(''));
  };

  const shown = localError ?? error ?? null;

  return (
    <form onSubmit={submit} style={{ padding: '12px 14px', borderTop: '3px solid var(--ink)' }}>
      <label htmlFor="ep-correction-desc" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        Décrire la correction (dessin)
      </label>
      <textarea
        id="ep-correction-desc"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (localError) setLocalError(null);
        }}
        placeholder="Décrire la correction…"
        aria-label="Décrire la correction (dessin)"
        aria-invalid={!!shown}
        rows={2}
        // A3 (iter 6) — white/on-brand textarea (--card #fffefb), not the paper tone.
        style={{
          width: '100%',
          border: '2px solid var(--ink)',
          borderRadius: 8,
          background: 'var(--card)',
          padding: '8px 10px',
          fontSize: 13,
          fontFamily: 'inherit',
          color: 'var(--ink)',
          resize: 'vertical',
        }}
      />
      {draftRegion && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontSize: 12 }}>
          <span style={{ border: '2px solid var(--ink)', borderRadius: 5, padding: '2px 8px', fontWeight: 700 }}>
            Zone :{' '}
            {`${Math.round(draftRegion.x * 100)},${Math.round(draftRegion.y * 100)} · ${Math.round(
              draftRegion.w * 100,
            )}×${Math.round(draftRegion.h * 100)}`}
          </span>
          <button
            type="button"
            onClick={onClearRegion}
            aria-label="Retirer la zone"
            style={{ background: 'none', border: 'none', color: 'var(--ink2)', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
          >
            ✕
          </button>
        </div>
      )}
      {/* A2 (iter 6) — dessin is the only type here, so the Scénario/Dessin "type" row is gone. */}
      <div style={{ display: 'flex', alignItems: 'center', marginTop: 9 }}>
        <button
          type="submit"
          disabled={busy}
          className="ep-btn-compact ep-btn-compact--primary"
          style={{ marginLeft: 'auto' }}
        >
          {busy ? 'Envoi…' : 'Demander'}
        </button>
      </div>
      {shown && (
        <div role="alert" style={{ marginTop: 8, color: 'var(--accent)', fontSize: 12, fontWeight: 700 }}>
          {shown}
        </div>
      )}
    </form>
  );
}
