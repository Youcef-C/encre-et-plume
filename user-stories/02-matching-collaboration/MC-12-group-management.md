# MC-12 — Manage group conversations "Gérer le groupe"

**As a** member of a group conversation, **I want** to manage the group — leave it, and (if I created it) add or remove members — and to open the profile of anyone in any of my conversations, **so that** I control who is in my group chats and can learn who I'm talking to.

> Screen(s): "Messages" (`data-screen="messages"`, the MC-9 messaging widget) + a group-info / members panel · Priority: Must · Fidelity: **Inferred** (the MESSAGES screen is drawn by [[MC-9]]; the group-management panel + member controls are intended but not fully drawn — treat conservatively, reuse the drawn patterns) · Epic: Matching & Collaboration

## Context
[[MC-9]] already builds the messaging widget and group conversations: `Conversation.type = dm | group | salon`, `ConversationParticipant` join rows, and a `GroupCreateModal` (`createConversation({ name, participantIds })` → a `group`). But there is **no stored group creator/owner** (the creator is merely the first participant), so "only the creator can add/kick" cannot be enforced today, and participant names do not link to profiles. This story adds the owner concept + the management actions + profile links.

**Scope — standalone groups only (user-specified 2026-07-10)**: a `group` `Conversation` may be **standalone** (`projectId == null`, an ad-hoc group DM) or **project-linked** (`projectId != null`, the [[CS-8]] project discussion chat — `a project group chat IS this conversation`). MC-12's **add / kick / leave management applies to STANDALONE groups only**. **Project-linked groups are excluded**: their membership follows the project ([[CS-8]] / [[MC-3]] invitations / [[CS-10]] co-authors), and the prototype's drawn **"Gérer le groupe"** button (MESSAGES header, line 1735) is that **project** surface — a separate, project-driven concern, NOT this story. The **view-profile** links apply to every conversation regardless.

## Model
- Add **`Conversation.createdBy`** (accountId of the **current owner**): set to the caller on group creation; **reassigned** on an owner-leave transfer (see Leave). **Backfill** existing groups: `createdBy` = the earliest-joined participant. Nullable only for `salon` (no owner); every `group` has one.

## Frontend
- **Members panel** for a group conversation (in the [[MC-9]] widget): the participant list (halftone avatar + display name), with a group header showing the group name + member count. The panel is reachable from the group conversation (e.g. a "Gérer le groupe" / members affordance in the conversation header) — reuse the widget's existing layout + tokens; this panel is **Inferred**.
- **View profile** (user-specified): every participant's name/avatar — in the **members panel AND in a solo DM** (the other party in the conversation header) — is a link to their public profile `/{profileSlug}` ([[F-3]]). Keyboard-focusable, labelled with the person's name.
- **Creator controls** (only when the viewer is `createdBy`):
  - **"Ajouter"** — a member search (reuse the [[MC-8]] contacts / partner search input pattern) → adds the chosen account to the group.
  - **"Retirer"** — a kick control on each *other* member's row (confirm) → removes them. The creator cannot "Retirer" themselves (they use "Quitter").
- **"Quitter le groupe"** — visible to **every** member (confirm dialog) → leaves the group. After leaving, the conversation drops out of the viewer's list.
- **States**: members loading; add-search loading/empty ("Aucun résultat"); add/kick/leave in-flight (disabled + spinner); error toast on failure (state unchanged); a member-only viewer sees no Ajouter/Retirer controls; optimistic list update with rollback on error.
- **Accessibility**: controls labelled with the target member's name; confirm dialogs focus-trapped; profile links reachable; the members panel is keyboard-operable.
- **Responsive**: the panel + member rows work at ~375 / 768 / 1280 without overflow; controls stay ≥ ~44px tap targets.
- **Realtime**: when a member is added/removed/leaves, the change fans out over the [[MC-9]] WS so open clients update the member list live (Redis adapter).

## Backend
Extend the [[MC-9]] messaging module. All management endpoints: authenticated ([[F-1]]), **membership-checked**, **standalone `type='group'` AND `projectId == null` only** (reject `dm`/`salon` → 400/404; reject **project-linked groups** `projectId != null` → 409/400 "géré via le projet" — their membership is governed by [[CS-8]]/[[MC-3]]/[[CS-10]]), and fan out over the WS gateway + emit notifications where relevant.
- **`POST /conversations/:id/participants`** `{ accountId }` — **creator only** (`caller === createdBy`, else 403) adds a member. Idempotent (already a member → no-op / 409). The added account must exist. Bump/refresh the member list; WS `participant.added`.
- **`DELETE /conversations/:id/participants/:accountId`** — **creator only** removes (kicks) another member. Cannot target `createdBy` (the creator uses leave). Removes the `ConversationParticipant`; WS `participant.removed`; notify the removed user.
- **`DELETE /conversations/:id/participants/me`** — **any** participant leaves: remove own `ConversationParticipant`. **If the leaver is the creator**: reassign `createdBy` to the **earliest-joined remaining** participant; if **no members remain**, delete the conversation (and its messages). WS `participant.removed` / `conversation.deleted`.
- **Authorization**: never trust client role/ownership claims — resolve `createdBy` + membership server-side on every call. A non-member gets 404 (don't leak existence); a non-creator attempting add/kick gets 403.
- **Validation**: `accountId` exists; target is/ isn't a member as appropriate; `:id` is a group the caller belongs to.

## Dependencies
- [[MC-9]] — the messaging widget, conversations, `ConversationParticipant`, group creation, the WS gateway this extends.
- [[F-1]] / [[F-2]] — authenticated user; server-side authz.
- [[F-3]] — the public profile the participant links open.
- [[MC-8]] — contacts/partner search reused for the "Ajouter" member picker.
- [[F-5]] — notification to a removed/added user (reuse the notification seam).

## Notes
- **"Gérer le groupe" control (approved 2026-07-10)**: rendered as a compact **GearIcon button** (ink-fill, from the shared SVG icon set) with the accessible name "Gérer le groupe" — an intentional product choice, NOT the prototype's bordered text-label button. Product-owner-approved deviation. Tap target 44×44.
- **Fidelity**: the MESSAGES screen is drawn by [[MC-9]]; the prototype's drawn **"Gérer le groupe"** (line 1735) is the **project** group surface (out of MC-12 scope). MC-12's **standalone-group management panel, add/kick/leave controls, and profile links are induced/Inferred** (user-specified 2026-07-10) — compose them from the drawn widget patterns/tokens; grade against these deviations.
- **Owner model decisions** (user-specified 2026-07-10): **creator-only** add + kick; **leave** open to all; **creator leaving auto-transfers** ownership to the earliest-joined remaining member (deletes the group if they were the last one). No explicit transfer-ownership UI this story.
- **Scope**: solo **DM** conversations get only the **view-profile** link (no add/kick/leave — a DM is a fixed 2-party thread). The **salon** ([[MC-11]]) is the global public room — excluded from group management (no owner, no membership editing).
- **Ponytail**: reuse the existing `ConversationParticipant` model (add only `Conversation.createdBy`), the [[MC-9]] WS fan-out, and the [[MC-8]] search input — smallest correct diff.
