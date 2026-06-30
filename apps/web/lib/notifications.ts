import type { NotifType } from '@encre-et-plume/shared';

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
};

// Icon per notification type (prototype unicode symbols)
export const NOTIF_ICON: Record<NotifType, string> = {
  message:          '✉',
  application:      '✎',
  report:           '⚠',
  invitation:       '✉',
  project_activity: '✎',
  release:          '⚑',
  like:             '♥',
  comment:          '✎',
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
