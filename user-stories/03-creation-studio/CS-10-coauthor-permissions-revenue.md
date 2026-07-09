# CS-10 — Co-author permissions & revenue split "Gérer le groupe"

**As a** Creator, **I want** to manage co-author roles, invites/revocations, and revenue-split shares, **so that** my team has the right access and everyone's cut is clearly defined.

> Screen(s): "Gérer le groupe" (nav `goPermissions` + revoke/share modal) · Priority: Should · Fidelity: Inferred

## Frontend
- Member list: each row shows the co-author (avatar, name, role) with role/permission controls.
- **Group roles** (user-specified 2026-07-09): each member holds a role of **Leader (chef·fe de groupe) / Co-leader (co-chef·fe) / Member (membre)**. A group has **at least one leader** and **may have several co-leaders** (equal leadership). A leader can promote a member to co-leader or hand over/leader status; the last leader cannot be demoted/revoked.
- Per-member actions: change role/permissions (incl. promote to co-leader); "revoke" a member (revoke modal); invite a new collaborator ([[MC-3]]).
- Revenue-split section: per-member share percentage (e.g. "votre part"), editable; live total with a constraint that shares sum to 100%.
- Share/invite affordance (share modal) to bring in a co-author.
- States: loading members; saving role/share; empty (owner only); revoke confirmation; error (e.g. shares don't sum to 100%, last owner cannot be revoked).
- Validation: revenue-split shares must sum to 100%; at least one owner must remain; role values constrained.
- Accessibility: member rows labelled; role selectors and percentage inputs labelled; revoke confirmation focus-trapped; total/validation announced.

## Backend
- **GET /projects/{slug}/members** — members with roles, permissions, and revenue shares.
- **PATCH /members/{id}** — update role/permissions.
- **POST /projects/{slug}/invites** — invite a collaborator → [[MC-3]].
- **DELETE /members/{id}** — revoke a member.
- **PATCH /projects/{slug}/revenue-split** — `{ shares: [{ memberId, pct }] }`.
- Entities: **Member** `{ id, projectId, userId, role: 'leader'|'coleader'|'member', permissions[], revenueSharePct }`.
- Business rules: shares must sum to 100%; cannot revoke/demote the **last leader** (≥1 leader always); permissions gate edit/publish across the studio ([[CS-4]], [[CS-6]], [[CS-7]], [[CS-9]]); **leadership decisions require every leader's consent** — notably a `join` collab proposal ([[MC-3]]) is established only when the leader and **all** co-leaders accept (any leader declining closes it).
- Authorization: owner / users with manage-group permission only.
- Side effects: revenue shares consumed by the project "Soutien" tab (MR epic); invite sends notification ([[F-5]]).

## Dependencies
- [[MC-3]] — collaborator invite.
- [[F-2]] — role definitions.
- [[CS-2]] — opened from the workspace header; gates studio edit/publish actions.

## Notes
- Inferred: derived from `goPermissions` nav and revoke/share modal CSS — no dedicated wireframe frame. Criteria kept conservative (member roles, invite/revoke, revenue split). Revenue-split feeds the Soutien tab (MR epic).
- The revenue split covers money only — IP ownership, publication licence, and per-member publish consent are [[CS-11]] ("Droits & licence", hosted in this same "Gérer le groupe" surface).
