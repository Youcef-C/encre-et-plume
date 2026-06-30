# PUB-1 — Publish a chapter

**As a** Creator, **I want** to publish a chapter immediately or schedule it for later and choose whether it is free or premium, **so that** my work goes live in the catalog and reaches my followers on the cadence I plan.

> Screen(s): "Espace projet" (publish bar + "Publier ▾"), "Sorties programmées" on home ([[DR-1]]) · Priority: Must · Fidelity: Explicit

## Frontend
- "Publier ▾" split/dropdown button in the project workspace publish bar (see [[CS-9]]). Dropdown offers:
  - "Publier maintenant" — immediate publish.
  - "Programmer…" — opens scheduling controls (date/time + cadence from [[CS-9]]).
- Access selector per chapter: "Gratuit" / "Premium ★" (premium ties to support tiers [[MR-1]]).
- Pre-publish summary shows: chapter title, page count, cover thumbnail, target access, and (if scheduled) the chosen date/time.
- Confirm action: "Publier" / "Programmer la sortie".
- States:
  - Disabled "Publier ▾" when chapter is not publishable (no ordered pages, or no cover) with inline reason: "Ajoutez et réorganisez les pages" / "Définissez une couverture".
  - Loading state on confirm (spinner, button disabled).
  - Success confirmation: chapter shown as "En ligne"; scheduled chapter shown as "Programmé · <date>".
  - Error: toast on failure, controls re-enabled, selections preserved.
- Empty/loading: if chapter has zero pages, show empty hint pointing to [[CS-6]].
- Validation surfaced in UI: pages must be arranged and a cover set before "Publier ▾" enables.
- Accessibility: dropdown is a labelled menu, keyboard-navigable; access selector is a radiogroup with labels; date/time uses native `<input type="datetime-local">`; status badges have text, not color alone.

## Backend
- **POST /chapters/{chapterId}/publish** — `{ mode: "now"|"scheduled", scheduledAt?, access: "free"|"premium" }`. Response: `{ chapterId, status: "live"|"scheduled", publishedAt|scheduledAt, access }`.
- Entity **Chapter**: `id, workId, title, order, status (draft|scheduled|live), access (free|premium), pages[] (ordered), coverAssetId, scheduledAt, publishedAt`.
- Business rules:
  - Chapter must have ordered pages and a cover set before publish ([[CS-6]]); reject otherwise.
  - `mode: "now"` → status `live`, set `publishedAt`; chapter becomes readable via [[DR-4]] and appears on work page ([[DR-3]]) and catalog.
  - `mode: "scheduled"` → status `scheduled`, store `scheduledAt`; appears in "Sorties programmées" on home ([[DR-1]]); a scheduler flips it to `live` at `scheduledAt`.
  - `access: "premium"` → chapter shown to non-supporters as "verrouillé ★" in the reader; gated by support tier ([[MR-1]]).
- Validation: `scheduledAt` required and in the future when `mode: "scheduled"`; `access` constrained to enum.
- Authorization: only project owner / co-author with publish permission ([[CS-10]], [[F-2]]).
- Side effects: on going live, emit publish notifications to followers and subscribers ([[F-5]], [[PUB-4]]); index chapter for discovery.

## Dependencies
- [[CS-6]] — pages must be arranged and cover set first.
- [[CS-9]] — scheduling cadence and publish bar host the control.
- [[MR-1]] — premium/locked chapters tied to support tiers.
- [[PUB-4]] — followers are the notification audience.
- [[F-5]] — publish notifications.
- [[DR-1]] — scheduled chapters surface in "Sorties programmées".
- [[DR-3]], [[DR-4]] — published chapter appears on work page and is readable.
- [[F-10]] — chapter page images + cover are stored/served via the media system (uploads + CDN; premium pages via signed URLs).

## Notes
- Explicit: "Publier ▾" in workspace + publish bar, "Sorties programmées" on home, premium/locked "verrouillé ★" in reader. Scheduling cadence detail inherited from [[CS-9]].
- Inferred: exact pre-publish summary layout and inline validation copy.
