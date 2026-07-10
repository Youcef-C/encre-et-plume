# MC-13 — Comptoir presence roster + reachable-user search (+ closeIfFilled)

**As a** member in "Le Comptoir" (the global salon), **I want** to see who's currently in the room and act on them (view profile, DM, block), and — everywhere I build a group — to search all users I'm allowed to reach (not just my contacts), **so that** the community room feels alive and I can start conversations with anyone open to them.

> Screen(s): "Le Comptoir" ([[MC-11]] salon, `data-screen`≈`salon`) + the "Nouveau groupe" modal and the [[MC-12]] group members panel · Priority: Should · Fidelity: **Inferred** (the roster + reworked pickers are induced — user-specified 2026-07-10) · Epic: Matching & Collaboration

## Context
[[MC-11]] builds "Le Comptoir" (one global public room). [[MC-9]] runs the WS gateway (Redis adapter) + DM create; a DM to a non-contact is routed by the recipient's **`dmPolicy`** ([[F-19]]: `anyone | requests | contacts`, default `requests`). A read-only **`PresenceService`** ([[MC-8]]) reports *online-anywhere* from the [[F-18]] Redis session index — NOT room presence. [[MC-10]] provides block. [[MC-12]] added the standalone-group members panel with an "Ajouter un membre" picker; both it and the "Nouveau groupe" modal ([[MC-9]] `GroupCreateModal`) currently search **contacts only**. This story adds true Comptoir room presence + a reachable-user search reused by both pickers, and wires an existing call-close helper.

## A) Comptoir presence roster

### Frontend
- **User-list trigger (user-specified 2026-07-10, revised)**: NOT a top bar. A **small user-icon button on the right, outside the main widget area**, that toggles the user list. The button carries the current **member count** (badge). Clicking it opens the roster (side panel on wide screens, overlay/drawer on narrow); it must not crowd the salon thread. Open/closed state remembered per session.
- **Roster list = current salon MEMBERS** (halftone avatar + display name), **including the viewer** (rendered as "· vous", no OverflowMenu on the self row) and **excluding blocked** users. Live: a user appears when they **join** the salon ("＋ Rejoindre le salon") and disappears only when they **leave** ("Quitter") — NOT on widget-collapse or disconnect. The **header count and the roster list length are the same number** (both = members incl self, minus blocked).
- **Per-user actions** via the shared `OverflowMenu`: **"Voir le profil"** (→ `/{slug}`, [[F-3]]), **"Envoyer un message"** (→ [[MC-9]] DM create — opens/routes per the target's `dmPolicy`), **"Bloquer"** (→ [[MC-10]] block; blocking removes them from the viewer's roster).
- **States**: loading; empty ("Personne d'autre pour le moment"); error/retry. **A11y**: the collapse toggle is a labelled button with `aria-expanded`; roster rows + menu keyboard-operable; profile links labelled with the person's name.

### Backend
- **Presence = salon MEMBERSHIP (revised 2026-07-10)**: the roster/count is the set of accounts that have **joined the salon** — the existing MC-11 `ConversationParticipant` on the salon `Conversation` (`SalonService.join` on "＋ Rejoindre le salon", `SalonService.leave` on "Quitter"). It **persists across widget-collapse and disconnect**; membership changes ONLY on explicit join/leave. **Remove** the WS-room ZSET / heartbeat / dock-enter-leave presence that was built — it's the wrong model. Keep a WS broadcast on join/leave so open viewers' count + list update live (reuse the [[MC-9]] gateway; emit on `SalonService.join`/`leave`).
- **`GET /salon/presence`** (FINAL, revised 2026-07-10) — `{ count, items }` where `items` = **ALL** current salon members the caller can see (exclude only blocked pairs), **INCLUDING the caller** (each item flags whether it is the caller, e.g. `self: true`); `count = items.length`. So the Comptoir **header count and the roster list are the SAME number** = "people who clicked ＋ Rejoindre le salon" (minus anyone the caller blocked). Caller alone → `count 1` + the caller shown in the list. `items` capped ≤100. Both the header and the roster must render THIS one count — never the app-online `getSalonOnlineAccountIds` number.
- **Authorization**: authenticated members only; blocked pairs filtered per-viewer. Reuse [[MC-8]] block seam.

## B) Reachable-user search (both group pickers)

### Backend
- **`GET /accounts/search?q=`** (or the nearest existing seam — do NOT reuse `/partners`, which is creator-profiles-only and excludes readers) — returns accounts whose `displayName` matches `q` (case-insensitive contains), **restricted to users the caller may reach**: the caller's **contacts** ([[MC-8]]) **OR** users whose **`dmPolicy ∈ {anyone, requests}`** ([[F-19]]) — i.e. exclude `dmPolicy = contacts` non-contacts. Exclude the caller and any **blocked** pair ([[MC-10]]). Paginated/capped, `q` trimmed/bounded. Returns `{ id, name, avatarUrl, slug }`.
- Business rule: this is the "who allowed anyone to DM/requests" population the product owner asked for — `dmPolicy` is the existing setting that expresses it.

### Frontend
- Replace the **contacts-only** picker in BOTH **`GroupCreateModal`** ("Nouveau groupe") and the [[MC-12]] **`GroupMembersPanel`** "Ajouter un membre" with this reachable-user search, using the **creation-wizard invite-search UI pattern** (debounced text input, suggestion rows, add → chip; on-brand `OnBrandSelect`/search input, never a native select). **Direct add** — a chosen non-contact is added straight into the group (no pending-invite flow); they can leave anytime ([[MC-12]]).
- States: search loading / empty ("Aucun résultat"); French verbatim. A11y + responsive per the design system.

## C) Wire `closeIfFilled` (fixes the QA-found gap)
- **Backend**: after `ReceivedApplicationsService.decide(..., 'accepted')` commits, call the existing `CallsService.closeIfFilled(callId)` — when every sought seat is filled, it flips the call `status` to `closed` (stops further applications). Idempotent; only on accept; a partial fill leaves the call open. Add the seam + a spec (accepting the last seat closes the call; accepting a non-final seat does not).

## Dependencies
- [[MC-11]] — Le Comptoir salon (the room this roster describes).
- [[MC-9]] — WS gateway (Redis adapter) + DM create routed by `dmPolicy`; `GroupCreateModal`.
- [[MC-12]] — the group members panel "Ajouter un membre" reworked here; direct-add semantics.
- [[MC-10]] — block (per-viewer filtering + the "Bloquer" action).
- [[MC-8]] — contacts (search inclusion) + the existing (online-anywhere) `PresenceService` (NOT reused for room presence).
- [[F-3]] — the profile the "Voir le profil" action opens.
- [[F-18]] — the Redis session/heartbeat infra the room presence builds on.
- [[F-19]] — `dmPolicy` (the reachability filter).
- [[MC-4]]/[[MC-7]] — `closeIfFilled` on accept.

## Notes
- **Fidelity**: the Comptoir screen is [[MC-11]]; the **roster side-menu, per-user actions, the reworked group pickers, and the reachable-user search are induced** (user-specified 2026-07-10) — grade against these, reusing the drawn salon + widget patterns/tokens and the shared `OverflowMenu`.
- **Presence semantics (user-specified 2026-07-10, revised)**: "en ligne" here = **has joined the salon** ("＋ Rejoindre le salon"), counted until they click **"Quitter"** — NOT WS presence, NOT dock-expand, NOT app-online. Persists through collapse/disconnect. Backed by the MC-11 salon `ConversationParticipant` membership. The WS-room ZSET/heartbeat approach is removed. Count and list are consistent (count = others the caller sees; self excluded from both).
- **Search population (user-confirmed)**: reuse the EXISTING [[F-19]] `dmPolicy` setting (no new privacy setting) — contacts OR `dmPolicy ∈ {anyone, requests}`.
- **Ponytail**: reuse the [[MC-9]] WS gateway + [[F-18]] Redis for room presence, the shared `OverflowMenu`, the wizard search UI, the existing `dmPolicy`/block/contacts seams, and the already-written `closeIfFilled`. Smallest correct diff.
