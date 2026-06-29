# F-2 — Role model & differentiated access

**As a** Creator/Editor/Admin, **I want** my role to determine which spaces and controls I can reach, **so that** specialized areas (editor space, editorial space, admin panel) are only shown to the right people.

> Screen(s): avatar dropdown role switcher · dark banner "Connecté·e en tant qu'Éditeur · Maison partenaire" · Priority: Must · Fidelity: Explicit

## Frontend
- [ ] Role model with four roles: `utilisateur` (default reader/creator), `maintainer` (rédaction), `editor` (publisher), `admin`.
- [ ] Role-gated nav links in the header dropdown (see [[F-4]]): "Espace éditeur" ([[PE-1]]) for `editor`; "Espace rédaction" ([[PE-7]]) for `maintainer`; "Panneau admin" ([[AD-1]]) for `admin`.
- [ ] Contextual admin controls appear only for `admin` (and where applicable `maintainer`).
- [ ] Editor display: dark banner "Connecté·e en tant qu'Éditeur · Maison partenaire" plus a "✓ compte vérifié" pill when the editor account is verified.
- [ ] Demo role switcher in the avatar dropdown: "setRoleNormal" / "setRoleMaintainer" / "setRoleEditor" / "setRoleAdmin" — switches the simulated current role and re-renders gated UI.
- [ ] States: gated links hidden (not merely disabled) when role lacks access; unverified editor sees no "✓ compte vérifié" pill.
- [ ] Accessibility: switcher options keyboard-navigable and labelled.

## Backend
- [ ] Account carries a `role` field (enum: `utilisateur` | `maintainer` | `editor` | `admin`).
- [ ] Account carries `editor.verified` boolean (false until admin verification via [[AD-3]]).
- [ ] Route/feature gating middleware: each protected route/feature declares the role(s) allowed; requests from other roles are rejected (403) and links suppressed client-side.
- [ ] PATCH /accounts/{id}/role — admin-only role change (real product path; demo switcher is client-only simulation).
- [ ] Business rules: editor-only surfaces require role `editor` AND `editor.verified === true`.
- [ ] Authorization: only `admin` may change roles or set `editor.verified`.
- [ ] Side effects: changing a role updates which header links and controls are exposed.

## Dependencies
- [[F-1]] — role lives on the account.
- [[AD-3]] — editor verification sets `editor.verified`.
- [[PE-1]], [[PE-7]], [[AD-1]] — the gated destinations.
- [[F-4]] — header surfaces gated links.

## Notes
- Explicit: role machinery is present in the prototype, including the demo role switcher (setRoleNormal/Maintainer/Editor/Admin) and the editor banner + verified pill.
- The demo switcher is a prototyping convenience; the production role change path is admin-driven (PATCH above).
