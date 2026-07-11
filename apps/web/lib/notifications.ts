import type { ComponentType, CSSProperties } from 'react';
import type { NotifType, NotificationItem } from '@encre-et-plume/shared';
import { CheckIcon, CircleDotIcon, FlagIcon, HeartIcon, MailIcon, PenIcon, UserIcon, WarningIcon, XIcon } from '../components/icons';

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
  // MC-8: connection request lifecycle
  connection_request:  (n) => `${n} souhaite se connecter avec vous`,
  connection_accepted: (n) => `${n} a accepté votre demande de connexion`,
  // F-14: system notification (e.g. export ready)
  system:           ()  => 'Notification système',
  // MC-12: the group creator removed you from a group
  group_removed:    (n) => `${n} vous a retiré·e d'un groupe`,
  // CS-2: mentioned via @name in a card comment (fallback when message override is absent)
  mention:          (n) => `${n} vous a mentionné·e dans un commentaire`,
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
  // MC-8: connection lifecycle
  connection_request:  UserIcon,
  connection_accepted: CheckIcon,
  system:           CircleDotIcon,
  // MC-12: kicked from a group
  group_removed:    UserIcon,
  // CS-2: comment mention
  mention:          PenIcon,
};

// ponytail: closest existing route per type until target surfaces are built (MC-7, MC-9, etc.)
export const NOTIF_HREF: Record<NotifType, string> = {
  message:          '/contacts',
  application:      '/candidatures-recues',
  report:           '/admin',
  invitation:       '/invitations',
  project_activity: '/projets',
  release:          '/lire',
  like:             '/notifications',
  comment:          '/notifications',
  // MC-7: decision on the applicant's candidature → their own "Mes candidatures"
  application_accepted: '/mes-candidatures',
  application_rejected: '/mes-candidatures',
  // MC-8: both connection notifications route to the contacts page
  connection_request:  '/contacts',
  connection_accepted: '/contacts',
  // F-14: system (export ready) → parametres for download link
  system:           '/parametres',
  // ponytail: MC-12 — the group no longer exists for the removed user, so there's no target
  // surface; route home. Change when a "left groups" archive surface exists.
  group_removed:    '/',
  // CS-2: mention lives in a project card — route to the projects surface (same as project_activity)
  mention:          '/projets',
};

export function notificationHref(type: NotifType, _refId: string | null): string {
  return NOTIF_HREF[type];
}

// CS-2 (B6/F7): prefer the server's per-notification copy override; fall back to the per-type map.
export function notificationLabel(item: NotificationItem): string {
  if (item.message) return item.message;
  const sourceName = item.sourceUser?.displayName ?? 'Quelqu\'un';
  return NOTIF_LABEL[item.type](sourceName);
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
