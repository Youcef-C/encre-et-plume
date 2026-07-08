// MC-4X — one source of truth for the call role gate, shared by CallBoardCard, CallDetailModal
// and ApplyCallModal so the FE hint copy and the disabled state can't drift apart.
import { DOCUMENT_ALLOWED_CONTENT_TYPES } from '@encre-et-plume/shared';
import type { CreatorRole } from '@encre-et-plume/shared';

const DOCUMENT_CONTENT_TYPES = new Set<string>(DOCUMENT_ALLOWED_CONTENT_TYPES);

/** True for the non-image (PDF / text) upload family — routes a file to the document kind. */
export function isDocumentType(contentType: string): boolean {
  return DOCUMENT_CONTENT_TYPES.has(contentType);
}

/** On-brand French label for a creator role — chips, team rows, choosers. */
export const ROLE_LABEL: Record<CreatorRole, string> = {
  scenariste: 'Scénariste',
  dessinateur: 'Dessinateur·rice',
};

// "un·e X" phrase used inside the gate hint sentence.
const ROLE_PHRASE: Record<CreatorRole, string> = {
  scenariste: 'un·e scénariste',
  dessinateur: 'un·e dessinateur·rice',
};

/**
 * French hint next to a role-gated (disabled) "Candidater" button. req6: a call can seek 1..2 roles;
 * a multi-role call lists both ("… un·e dessinateur·rice ou un·e scénariste.").
 */
export function roleGateHint(seekingRoles: CreatorRole[]): string {
  const phrases = seekingRoles.map((r) => ROLE_PHRASE[r]).join(' ou ');
  return `Cet appel recherche ${phrases}.`;
}
