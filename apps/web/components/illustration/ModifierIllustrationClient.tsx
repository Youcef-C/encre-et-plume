'use client';

// CS-13 FE-3 — full-page owner editor for one illustration at /illustration/:id/modifier. Mirrors
// IllustrationClient's state machine (loading/notfound/error/ready) but renders the shared
// IllustrationEditFields in a plain document flow (no dialog → no focus trap needed). Owner-only:
// a non-owner or unknown id gets the same "Illustration introuvable" block, never the form (the
// server still enforces on PATCH). Anonymous → /connexion.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ApiError, IllustrationDetail } from '@encre-et-plume/shared';
import * as api from '../../lib/api';
import { useSession } from '../../lib/session';
import IllustrationEditFields, {
  buildUpdateRequest,
  initialEditValues,
  type IllustrationEditValues,
} from './IllustrationEditFields';

type State = 'loading' | 'ready' | 'notfound' | 'error';

const footerBtn: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  border: '2px solid var(--ink)',
  borderRadius: 6,
  padding: '9px 18px',
  minHeight: 44,
  cursor: 'pointer',
  fontFamily: 'inherit',
};
const errText: React.CSSProperties = { fontSize: 13, color: 'var(--accent)', fontWeight: 700, margin: '8px 0 0' };

export default function ModifierIllustrationClient({ id }: { id: string }) {
  const { account, loading: sessionLoading } = useSession();
  const router = useRouter();

  const [state, setState] = useState<State>('loading');
  const [detail, setDetail] = useState<IllustrationDetail | null>(null);
  const [values, setValues] = useState<IllustrationEditValues | null>(null);

  const [titleError, setTitleError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);

  // Anonymous (session resolved, no account) → sign-in.
  useEffect(() => {
    if (!sessionLoading && !account) router.replace('/connexion');
  }, [sessionLoading, account, router]);

  useEffect(() => {
    if (sessionLoading || !account) return; // wait for a resolved, signed-in session
    let cancelled = false;
    setState('loading');
    api
      .getIllustration(id)
      .then((data) => {
        if (cancelled) return;
        // Owner-only: a non-owner never sees the form (mirrors the server's uniform 404).
        if (data.artist.id !== account.id) {
          setState('notfound');
          return;
        }
        setDetail(data);
        setValues(initialEditValues(data));
        setState('ready');
      })
      .catch((err: ApiError) => {
        if (cancelled) return;
        setState(err.statusCode === 404 ? 'notfound' : 'error');
      });
    return () => {
      cancelled = true;
    };
  }, [id, account, sessionLoading]);

  async function handleSubmit() {
    if (pending || !values) return;
    if (!values.title.trim()) {
      setTitleError('Un titre est requis');
      return;
    }
    setTitleError(null);
    setServerError(null);
    setPending(true);
    try {
      await api.updateIllustration(id, buildUpdateRequest(values));
      router.push('/illustration/' + id);
    } catch (err) {
      setServerError((err as ApiError).message ?? 'Une erreur est survenue. Réessayez.');
      setPending(false);
    }
  }

  if (state === 'loading' || sessionLoading || !account) {
    return (
      <div
        role="status"
        aria-label="Chargement de l'illustration…"
        className="ep-skeleton-delayed"
        style={{ maxWidth: 720, margin: '0 auto', padding: '28px 28px 80px' }}
      >
        <div aria-hidden="true" style={{ height: 480, background: 'var(--tone)', opacity: 0.5, borderRadius: 12 }} />
      </div>
    );
  }

  if (state === 'notfound' || state === 'error') {
    return (
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '60px 28px', textAlign: 'center' }}>
        <Link href="/galerie" style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink2)' }}>
          ‹ Galerie
        </Link>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(32px, 6vw, 56px)', textTransform: 'uppercase', margin: '20px 0 12px' }}>
          Illustration introuvable
        </h1>
        <p style={{ color: 'var(--ink2)', fontSize: 15 }}>
          Cette illustration n&apos;existe pas ou vous n&apos;êtes pas autorisé·e à la modifier.
        </p>
      </div>
    );
  }

  if (!detail || !values) return null;

  return (
    <div data-page="modifierillus" style={{ maxWidth: 720, margin: '0 auto', padding: '22px 28px 80px' }}>
      <Link href={`/illustration/${id}`} style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink2)' }}>
        ‹ Illustration
      </Link>

      <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 'clamp(28px, 5vw, 44px)', textTransform: 'uppercase', margin: '14px 0 20px', lineHeight: 1 }}>
        Modifier l’illustration
      </h1>

      <div
        style={{
          background: 'var(--card)',
          border: '3px solid var(--ink)',
          borderRadius: 12,
          boxShadow: '7px 7px 0 var(--shadow)',
          padding: '20px 22px',
        }}
      >
        <IllustrationEditFields
          detail={detail}
          values={values}
          onChange={setValues}
          titleError={titleError}
          onUploadBusyChange={setUploadBusy}
          idPrefix="modifier-illus"
        />

        {serverError && (
          <p role="alert" style={{ ...errText, marginTop: 4 }}>
            {serverError}
          </p>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: 18 }}>
          <button
            type="button"
            onClick={() => router.push('/illustration/' + id)}
            className="ep-btn-secondary"
            style={footerBtn}
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={pending || uploadBusy}
            className="ep-btn-primary"
            style={{ ...footerBtn, opacity: pending || uploadBusy ? 0.6 : 1 }}
          >
            {pending ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}
