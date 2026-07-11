'use client';

// F-21: "Aide & contact" — public support / contact / bug-report form.
// Inferred screen (no prototype frame): built on the platform's on-brand form
// controls (.ep-input / OnBrandSelect / .ep-btn-*), ink borders + hard offset shadows.

import { useEffect, useMemo, useState } from 'react';
import {
  SUPPORT_CATEGORIES,
  SUPPORT_CATEGORY_LABELS,
  type SupportCategory,
  type SupportTicketContext,
  type CreateSupportTicketRequest,
  type ApiError,
} from '@encre-et-plume/shared';
import { createSupportTicket, getLastRequestId } from '../../lib/api';
import { useSession } from '../../lib/session';
import OnBrandSelect from '../form/OnBrandSelect';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUPPORT_EMAIL = 'support@encre-et-plume.fr';

type FormState = 'idle' | 'submitting' | 'success' | 'error';

interface FieldErrors {
  name?: string;
  email?: string;
  message?: string;
}

/** Fields captured for a bug report; each row is user-removable. */
type BugField = keyof SupportTicketContext;

export default function ContactClient() {
  const { account } = useSession();

  const [category, setCategory] = useState<SupportCategory | ''>('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState(''); // honeypot
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [formState, setFormState] = useState<FormState>('idle');
  const [serverError, setServerError] = useState<string | null>(null);

  // Bug-report technical context (captured when "Signaler un bug" is picked).
  const [bugContext, setBugContext] = useState<SupportTicketContext | null>(null);

  // Signed-in submitters: server trusts the session e-mail; prefill read-only.
  const displayName = account ? account.displayName : name;
  const displayEmail = account ? account.email : email;
  const locked = !!account;

  useEffect(() => {
    if (category === 'bug') {
      // The page the user came from (tracked by Header across client-side navs, since
      // document.referrer stays stale on SPA navigation); fall back to referrer/current URL.
      const prevPath = sessionStorage.getItem('ep:prevPath');
      const url = prevPath
        ? window.location.origin + prevPath
        : document.referrer || window.location.href;
      const requestId = getLastRequestId();
      setBugContext({
        url,
        userAgent: navigator.userAgent,
        ...(requestId ? { requestId } : {}),
      });
    } else {
      setBugContext(null);
    }
  }, [category]);

  const errors = useMemo<FieldErrors>(() => {
    const e: FieldErrors = {};
    if (!displayName.trim()) e.name = 'Nom requis';
    if (!EMAIL_RE.test(displayEmail.trim())) e.email = 'Adresse e-mail invalide';
    if (!message.trim()) e.message = 'Message requis';
    return e;
  }, [displayName, displayEmail, message]);

  const valid = category !== '' && Object.keys(errors).length === 0;

  const removeBugField = (field: BugField) => {
    setBugContext((prev) => {
      if (!prev) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const buildContext = (): SupportTicketContext | undefined => {
    if (category !== 'bug' || !bugContext) return undefined;
    const ctx: SupportTicketContext = {};
    if (bugContext.url) ctx.url = bugContext.url;
    if (bugContext.userAgent) ctx.userAgent = bugContext.userAgent;
    if (bugContext.requestId) ctx.requestId = bugContext.requestId;
    return Object.keys(ctx).length ? ctx : undefined;
  };

  const resetForm = () => {
    setCategory('');
    if (!account) {
      setName('');
      setEmail('');
    }
    setMessage('');
    setWebsite('');
    setTouched({});
    setBugContext(null);
    setServerError(null);
    setFormState('idle');
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setTouched({ name: true, email: true, message: true, category: true });
    if (!valid) return;

    const body: CreateSupportTicketRequest = {
      category: category as SupportCategory,
      name: displayName.trim(),
      email: displayEmail.trim(),
      message: message.trim(),
      ...(buildContext() ? { context: buildContext() } : {}),
      ...(website ? { website } : {}),
    };

    setFormState('submitting');
    setServerError(null);
    try {
      await createSupportTicket(body);
      setFormState('success');
    } catch (err) {
      setServerError((err as ApiError)?.message ?? 'Une erreur est survenue. Réessayez.');
      setFormState('error');
    }
  };

  const submitting = formState === 'submitting';

  // ── Success view ───────────────────────────────────────────────────────────
  if (formState === 'success') {
    return (
      <Shell>
        <div className="ep-card" style={{ padding: '32px 36px', textAlign: 'center' }}>
          <p role="status" style={{ fontSize: 17, fontWeight: 700, margin: '0 0 20px' }}>
            Message envoyé — nous vous répondrons par e-mail.
          </p>
          <button type="button" className="ep-btn-secondary" onClick={resetForm}>
            Nouveau message
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      {/* Contact-info block */}
      <div className="ep-card" style={{ padding: '24px 28px', marginBottom: 28 }}>
        <p style={{ margin: '0 0 10px', fontSize: 15 }}>
          Écrivez-nous à{' '}
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            style={{ color: 'var(--accent)', fontWeight: 700, textDecoration: 'none' }}
          >
            {SUPPORT_EMAIL}
          </a>{' '}
          ou via le formulaire ci-dessous.
        </p>
        <p style={{ margin: '0 0 10px', fontSize: 14, color: 'var(--ink2)' }}>
          Nous répondons généralement sous 48 h ouvrées.
        </p>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--ink2)' }}>
          Pour signaler une œuvre, un commentaire ou un·e utilisateur·rice, utilisez le bouton
          « Signaler » directement sur le contenu concerné — ce formulaire est réservé aux
          questions et problèmes techniques.
        </p>
      </div>

      <form
        className="ep-card"
        style={{ padding: '28px 32px' }}
        onSubmit={(e) => void handleSubmit(e)}
        noValidate
        aria-label="Formulaire de contact"
      >
        {formState === 'error' && serverError && (
          <div
            role="alert"
            aria-live="assertive"
            style={{
              background: 'var(--accent-soft)',
              border: '2px solid var(--accent)',
              borderRadius: 6,
              padding: '10px 14px',
              marginBottom: 22,
              color: 'var(--accent)',
              fontWeight: 700,
              fontSize: 14,
            }}
          >
            {serverError}
          </div>
        )}

        {/* Category */}
        <div style={{ marginBottom: 20 }}>
          <label htmlFor="contact-sujet" className="ep-label">
            Sujet
          </label>
          <OnBrandSelect
            id="contact-sujet"
            value={category}
            onChange={(e) => setCategory(e.target.value as SupportCategory | '')}
            style={{ fontSize: 15, padding: '10px 12px' }}
          >
            <option value="" disabled>
              Choisissez un sujet
            </option>
            {SUPPORT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {SUPPORT_CATEGORY_LABELS[c]}
              </option>
            ))}
          </OnBrandSelect>
        </div>

        {/* Name */}
        <Field
          id="contact-nom"
          label="Nom"
          error={touched.name ? errors.name : undefined}
        >
          <input
            id="contact-nom"
            className="ep-input"
            value={displayName}
            readOnly={locked}
            autoComplete="name"
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, name: true }))}
            aria-invalid={touched.name && !!errors.name}
            aria-describedby={touched.name && errors.name ? 'contact-nom-error' : undefined}
            style={locked ? { background: 'var(--paper)', color: 'var(--ink2)' } : undefined}
          />
        </Field>

        {/* Email */}
        <Field
          id="contact-email"
          label="E-mail"
          error={touched.email ? errors.email : undefined}
        >
          <input
            id="contact-email"
            type="email"
            className="ep-input"
            value={displayEmail}
            readOnly={locked}
            autoComplete="email"
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, email: true }))}
            aria-invalid={touched.email && !!errors.email}
            aria-describedby={touched.email && errors.email ? 'contact-email-error' : undefined}
            style={locked ? { background: 'var(--paper)', color: 'var(--ink2)' } : undefined}
          />
        </Field>

        {/* Message */}
        <Field
          id="contact-message"
          label="Message"
          error={touched.message ? errors.message : undefined}
        >
          <textarea
            id="contact-message"
            className="ep-input"
            value={message}
            maxLength={5000}
            rows={6}
            onChange={(e) => setMessage(e.target.value)}
            onBlur={() => setTouched((t) => ({ ...t, message: true }))}
            aria-invalid={touched.message && !!errors.message}
            aria-describedby={touched.message && errors.message ? 'contact-message-error' : undefined}
            style={{ resize: 'vertical', minHeight: 120 }}
          />
        </Field>

        {/* Bug-report technical context */}
        {category === 'bug' && bugContext && (
          <div
            data-testid="bug-context"
            style={{
              border: '2px solid var(--tone)',
              borderRadius: 6,
              padding: '14px 16px',
              marginBottom: 20,
              background: 'var(--paper)',
            }}
          >
            <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700 }}>
              Contexte technique
            </p>
            <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--ink2)' }}>
              Ces informations nous aident à reproduire le problème. Vous pouvez retirer chaque
              ligne.
            </p>
            {bugContext.url !== undefined && (
              <ContextRow
                label="Page"
                value={bugContext.url}
                removeLabel="Retirer la page"
                onRemove={() => removeBugField('url')}
              />
            )}
            {bugContext.userAgent !== undefined && (
              <ContextRow
                label="Navigateur"
                value={bugContext.userAgent}
                removeLabel="Retirer le navigateur"
                onRemove={() => removeBugField('userAgent')}
              />
            )}
            {bugContext.requestId !== undefined && (
              <ContextRow
                label="Identifiant"
                value={bugContext.requestId}
                removeLabel="Retirer l’identifiant"
                onRemove={() => removeBugField('requestId')}
              />
            )}
          </div>
        )}

        {/* Honeypot — off-screen, never focusable, real users never fill it. */}
        <div
          aria-hidden="true"
          style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, overflow: 'hidden' }}
        >
          <label htmlFor="contact-website">Ne pas remplir</label>
          <input
            id="contact-website"
            name="website"
            type="text"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </div>

        <button
          type="submit"
          className="ep-btn-primary"
          disabled={!valid || submitting}
          aria-busy={submitting}
          style={{ width: '100%', fontSize: 16 }}
        >
          {submitting ? 'Envoi…' : 'Envoyer'}
        </button>
      </form>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div style={{ width: '100%', maxWidth: 720, margin: '0 auto' }}>{children}</div>;
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <label htmlFor={id} className="ep-label">
        {label}
      </label>
      {children}
      {error && (
        <span id={`${id}-error`} className="ep-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

function ContextRow({
  label,
  value,
  removeLabel,
  onRemove,
}: {
  label: string;
  value: string;
  removeLabel: string;
  onRemove: () => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        marginBottom: 8,
      }}
    >
      <span style={{ fontSize: 12, minWidth: 0, wordBreak: 'break-word' }}>
        <strong style={{ marginRight: 6 }}>{label} :</strong>
        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--ink2)' }}>{value}</span>
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel}
        style={{
          flexShrink: 0,
          background: 'none',
          border: 'none',
          color: 'var(--accent)',
          fontSize: 12,
          fontWeight: 700,
          cursor: 'pointer',
          padding: 0,
          textDecoration: 'underline',
        }}
      >
        Retirer
      </button>
    </div>
  );
}
