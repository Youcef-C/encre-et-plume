# PE-1 — Editor space access

**As a** Publisher/Editor, **I want** a role-gated entry into the publisher space, **so that** only my verified publishing house can access talent-scouting tools.

> Screen(s): "Espace éditeur" (route `/editeur/talents`) · Priority: Must · Fidelity: Explicit

## Frontend
- Nav link "Espace éditeur" rendered **only** when the signed-in user has role `editor` AND the verified flag is set. Hidden for all other roles.
- Dark role banner at top of the space: "Connecté·e en tant qu'Éditeur · Maison partenaire" with a "✓ compte vérifié" pill.
- States: verified editor (banner + pill shown); editor pending verification (no access — show a guard message pointing to the verification process, see [[AD-3]]); non-editor (link absent, direct navigation blocked).
- Loading: skeleton on the banner while session/role resolves. Error: if authz check fails, show a "403 — accès réservé aux éditeurs vérifiés" state, not a blank page.
- Accessibility: banner is a landmark with readable contrast on dark background; "✓ compte vérifié" pill has an accessible label ("compte vérifié"); nav link reachable by keyboard.

## Backend
- Authz middleware on all `/editeur/*` routes: allow only when `role === editor` AND `verified === true`; respond `403` otherwise.
- `GET /editeur/talents` — entry route; returns the talent radar payload ([[PE-2]]) for authorized editors.
- Entities: User { id, role, ... }; EditorOrg { id, name ("maison"), verified: bool, verifiedBy (admin id), verifiedAt }.
- Business rule: `verified` is set exclusively by an admin action ([[AD-3]]); editors cannot self-verify.
- Validation: reject requests with a forged/mismatched role; re-check verified flag server-side on every request (do not trust client).
- Side effects: none (read/guard only).

## Dependencies
- [[AD-3]] — admin sets the verified flag that gates access.
- [[F-2]] — provides the `editor` role.
- [[F-1]] — account/session that carries the role.

## Notes
- Explicit: route `/editeur/talents`, the dark banner text, the "✓ compte vérifié" pill, and the role-only nav link are all in the prototype.
- Inferred: the exact 403/pending-verification copy and skeleton behavior.
