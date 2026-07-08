import type { ComponentType, CSSProperties } from 'react';
import type { NotifType } from '@encre-et-plume/shared';
import { CheckIcon, CircleDotIcon, FlagIcon, HeartIcon, MailIcon, PenIcon, WarningIcon, XIcon } from '../components/icons';

// French label composer per notification type (single source of truth on web)
export const NOTIF_LABEL: Record<NotifType, (name: string) => string> = {
  message:          (n) => `${n} vous a envoyé un message`,
  application:      (n) => `${n} a postulé à votre projet`,
  report:           ()  => 'Nouveau signalement à traiter',
  invitation:       (n) => `${n} vous a invité·e à collaborer`,
  project_activity: (n) => `${n} a mis à jour le projet`,
  release:          ()  => 'Nouveau chapitre disponible',
  like:             (n) => `${n} a aimé votre planche`,
  comment:          (n) => `${n} a commenté votre œuvre`,
  // MC-7: the call owner decided on the applicant's candidature
  application_accepted: (n) => `${n} a accepté votre candidature`,
  application_rejected: (n) => `${n} n'a pas retenu votre candidature`,
  // F-14: system notification (e.g. export ready)
  system:           ()  => 'Notification système',
};

// Icon component per notification type (SVG icon set — no emojis in the UI)
export const NOTIF_ICON: Record<NotifType, ComponentType<{ size?: number; style?: CSSProperties }>> = {
  message:          MailIcon,
  application:      PenIcon,
  report:           WarningIcon,
  invitation:       MailIcon,
  project_activity: PenIcon,
  release:          FlagIcon,
  like:             HeartIcon,
  comment:          PenIcon,
  application_accepted: CheckIcon,
  application_rejected: XIcon,
  system:           CircleDotIcon,
};

// ponytail: closest existing route per type until target surfaces are built (MC-7, MC-9, etc.)
export const NOTIF_HREF: Record<NotifType, string> = {
  message:          '/contacts',
  application:      '/candidatures-recues',
  report:           '/admin',
  invitation:       '/candidatures-recues',
  project_activity: '/tableau-de-bord',
  release:          '/lire',
  like:             '/notifications',
  comment:          '/notifications',
  // MC-7: decision on the applicant's candidature → their own "Mes candidatures"
  application_accepted: '/mes-candidatures',
  application_rejected: '/mes-candidatures',
  // F-14: system (export ready) → parametres for download link
  system:           '/parametres',
};

export function notificationHref(type: NotifType, _refId: string | null): string {
  return NOTIF_HREF[type];
}

// Simple French relative time (no Intl.RelativeTimeFormat needed)
export function relativeTime(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'à l\'instant';
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.floor(diff / 3600000);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.floor(diff / 86400000);
  if (days === 1) return 'hier';
  return `il y a ${days} j`;
}
