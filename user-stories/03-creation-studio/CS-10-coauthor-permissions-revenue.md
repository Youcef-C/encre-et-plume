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
- **Split changes are governed, not unilateral** (user, 2026-08-02) — see « Protection contre les
  changements abusifs » below. The editor shows the **pending** proposal alongside the split in force,
  who still has to accept it, and a « Historique des parts » the whole group can read.
- Accessibility: member rows labelled; role selectors and percentage inputs labelled; revoke confirmation focus-trapped; total/validation announced.

## Backend
- **GET /projects/{slug}/members** — members with roles, permissions, and revenue shares.
- **PATCH /members/{id}** — update role/permissions.
- **POST /projects/{slug}/invites** — invite a collaborator → [[MC-3]].
- **DELETE /members/{id}** — revoke a member.
- **PATCH /projects/{slug}/revenue-split** — `{ shares: [{ memberId, pct }] }`. **Proposes** a new split;
  it becomes effective per the consent rule below, never on the spot when someone's share drops.
- **POST /projects/{slug}/revenue-split/{version}/consent** — `{ action: 'accept' | 'refuse' }`, callable
  only by a member whose share the proposal REDUCES. A refusal closes the proposal; the split in force
  is untouched.
- **GET /projects/{slug}/revenue-split/history** — the append-only record (paginated).
- Entities: **Member** `{ id, projectId, userId, role: 'leader'|'coleader'|'member', permissions[], revenueSharePct }`.
- Business rules: shares must sum to 100%; **a split is VERSIONED and append-only** (below); cannot revoke/demote the **last leader** (≥1 leader always); permissions gate edit/publish across the studio ([[CS-4]], [[CS-6]], [[CS-7]], [[CS-9]]); **leadership decisions require every leader's consent** — notably a `join` collab proposal ([[MC-3]]) is established only when the leader and **all** co-leaders accept (any leader declining closes it).
- Authorization: owner / users with manage-group permission only.
- Side effects: revenue shares consumed by the project "Soutien" tab (MR epic); invite sends notification ([[F-5]]).

## Protection contre les changements abusifs (user-specified, 2026-08-02)

A leader could otherwise cut a co-author's share the day before a payout — or after the work succeeds —
and, because [[MR-5]] and [[MR-6]] read the *current* split, **retroactively re-attribute money already
earned**. Four rules, in order of importance:

1. **Non-retroactivity — the load-bearing one.** Revenue is attributed **at the moment it is earned**,
   against the split **in force at that moment**. `RevenueSplit` becomes versioned and **append-only**
   (`{ projectId, version, effectiveFrom, shares[], proposedBy, acceptedBy[] }`); every earning
   ([[MR-1]] subscription charge, [[MR-3]] donation) records the split **version** it was earned under,
   and [[MR-6]] settles against that recorded version — **never** against the current one. Without this,
   consent and audit are decoration: the money can still be re-pointed after the fact.
2. **Consent from anyone who loses.** A proposal that **reduces** any member's share requires **that
   member's** explicit acceptance before it takes effect (the same idiom as this story's existing
   "leadership decisions require every leader's consent"). Until then the previous version stays in
   force. A proposal that reduces nobody applies immediately — someone giving up their own share should
   not need a ceremony.
3. **Audit trail.** The history is readable by every member: who proposed, when, from → to per member,
   who accepted or refused. Disputes and [[AD-*]] moderation both need it, and it is free once the split
   is append-only.
4. **Rate limit.** At most a small number of proposals per project per period, so a leader cannot wear a
   co-author down by re-proposing daily. Harassment-by-renegotiation is the abuse this closes.

**Not in scope:** arbitration of a refused proposal (a deadlocked group is a human problem, not a
feature), and retroactive correction of an accepted split — the append-only history is the record.

## Dependencies
- [[MC-3]] — collaborator invite.
- [[F-2]] — role definitions.
- [[CS-2]] — opened from the workspace header; gates studio edit/publish actions.
- [[MR-5]] [[MR-6]] — they consume the split; the non-retroactivity rule above is binding on both.

## Notes
- Inferred: derived from `goPermissions` nav and revoke/share modal CSS — no dedicated wireframe frame. Criteria kept conservative (member roles, invite/revoke, revenue split). Revenue-split feeds the Soutien tab (MR epic).
- The revenue split covers money only — IP ownership, publication licence, and per-member publish consent are [[CS-11]] ("Droits & licence", hosted in this same "Gérer le groupe" surface).
