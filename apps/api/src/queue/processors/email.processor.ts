import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import type { JobProcessor } from '../job-processor';
import type { EmailJob } from '@encre-et-plume/shared';

/** Pure render — no I/O, easily unit-testable. */
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

/** F-12: Password reset email. */
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

/** F-12: Password changed notice email. */
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

/**
 * Processor for the `email` queue (F-11/F-12).
 * Transport = log no-op in dev/CI. F-16 swaps in the real provider behind this seam.
 * ponytail: log transport; F-16 swaps in the real provider behind this seam.
 */
@Injectable()
export class EmailProcessor implements JobProcessor<EmailJob> {
  readonly queue = 'email' as const;
  readonly concurrency = 5;

  // ponytail: public so test can inject a spy logger without private field access hacks
  logger = new Logger(EmailProcessor.name);

  async process(data: EmailJob, _job: Job): Promise<void> {
    let subject: string;
    switch (data.template) {
      case 'password_reset':
        ({ subject } = renderPasswordResetEmail(data.params));
        break;
      case 'password_changed':
        ({ subject } = renderPasswordChangedEmail(data.params));
        break;
      default:
        ({ subject } = renderVerificationEmail(data.params));
        break;
    }
    // Log only non-sensitive fields — never verifyUrl/resetUrl or raw tokens
    this.logger.log(`email sent to ${data.to} template=${data.template} subject="${subject}"`);
  }
}
