// F-16: Template renderers — one per EmailTemplateKey; called by EmailProcessor.
// Moved from email.processor.ts (was subject+text only); now adds html via wrapHtml.
import { EMAIL_TEMPLATES } from '@encre-et-plume/shared';
import type { EmailTemplateKey } from '@encre-et-plume/shared';
import { wrapHtml, wrapText } from './layout';

// ── Individual renderers (pure, no I/O) ──────────────────────────────────────

export function renderVerificationEmail(params: Record<string, string>): { subject: string; text: string } {
  return {
    subject: `Confirmez votre adresse e-mail — Encre & Plume`,
    text: [
      `Bonjour ${params['displayName'] ?? ''},`,
      ``,
      `Merci de vous être inscrit·e sur Encre & Plume.`,
      `Cliquez sur le lien ci-dessous pour confirmer votre adresse e-mail :`,
      ``,
      params['verifyUrl'] ?? '',
      ``,
      `Ce lien expire dans 24 heures.`,
      ``,
      `À bientôt,`,
      `L'équipe Encre & Plume`,
    ].join('\n'),
  };
}

export function renderPasswordResetEmail(params: Record<string, string>): { subject: string; text: string } {
  return {
    subject: `Réinitialisation de votre mot de passe — Encre & Plume`,
    text: [
      `Bonjour ${params['displayName'] ?? ''},`,
      ``,
      `Vous avez demandé la réinitialisation de votre mot de passe sur Encre & Plume.`,
      `Cliquez sur le lien ci-dessous pour choisir un nouveau mot de passe :`,
      ``,
      params['resetUrl'] ?? '',
      ``,
      `Ce lien expire dans 1 heure.`,
      ``,
      `Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail — votre mot de passe reste inchangé.`,
      ``,
      `À bientôt,`,
      `L'équipe Encre & Plume`,
    ].join('\n'),
  };
}

export function renderPasswordChangedEmail(params: Record<string, string>): { subject: string; text: string } {
  return {
    subject: `Votre mot de passe a été modifié — Encre & Plume`,
    text: [
      `Bonjour ${params['displayName'] ?? ''},`,
      ``,
      `Votre mot de passe sur Encre & Plume vient d'être modifié.`,
      ``,
      `Si vous n'êtes pas à l'origine de ce changement, contactez-nous immédiatement.`,
      ``,
      `À bientôt,`,
      `L'équipe Encre & Plume`,
    ].join('\n'),
  };
}

export function renderWelcomeEmail(params: Record<string, string>): { subject: string; text: string } {
  return {
    subject: `Bienvenue sur Encre & Plume !`,
    text: [
      `Bonjour ${params['displayName'] ?? ''},`,
      ``,
      `Bienvenue sur Encre & Plume — la plateforme de création manga en France.`,
      `Vous pouvez dès maintenant compléter votre profil et trouver votre prochain partenaire de création.`,
      ``,
      `À bientôt,`,
      `L'équipe Encre & Plume`,
    ].join('\n'),
  };
}

// ── html helper ───────────────────────────────────────────────────────────────

/** Convert newline-delimited plain text to simple HTML paragraphs (e-mail-safe). */
function textToHtml(text: string): string {
  return text
    .split('\n\n')
    .map((para) => `<p style="margin:0 0 12px 0;">${para.replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

/**
 * Render any catalog template into { subject, html, text }.
 * Called by EmailProcessor — rendering happens in the worker, not in EmailService.send().
 */
export function renderEmail(
  template: EmailTemplateKey,
  params: Record<string, string>,
): { subject: string; html: string; text: string } {
  const entry = EMAIL_TEMPLATES[template];
  const mandatory = entry?.mandatory ?? true;

  let raw: { subject: string; text: string };
  switch (template) {
    case 'password_reset':
      raw = renderPasswordResetEmail(params);
      break;
    case 'password_changed':
      raw = renderPasswordChangedEmail(params);
      break;
    case 'welcome':
      raw = renderWelcomeEmail(params);
      break;
    default:
      raw = renderVerificationEmail(params);
      break;
  }

  const html = wrapHtml({
    title: raw.subject,
    bodyHtml: textToHtml(raw.text),
    mandatory,
    unsubscribeUrl: !mandatory ? params['unsubscribeUrl'] : undefined,
  });

  return { subject: raw.subject, html, text: wrapText(raw.text) };
}
