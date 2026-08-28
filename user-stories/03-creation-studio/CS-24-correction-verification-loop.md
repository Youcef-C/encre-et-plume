# CS-24 — Correction verification loop "Vérification des corrections"

**As the** person who filed a correction, **I want** to be told when it is marked fixed and to be able to reopen it, **so that** a card doesn't advance to PROPRE on the word of the one person who had an interest in closing it.

> Screen(s): the [[CS-5]] review screen (correction list) · the [[F-5]] notification centre · Priority: Should · Fidelity: **Inferred** (extends a drawn screen; grade against the criteria)

## Why this story exists

Today the loop closes on one signature. A correction's status may be changed by its **author or its
assignee** (`corrections.service.ts:184-186`), so the artist fixing *« la main de la case 3 est à
l'envers »* marks it `corrigé` themselves. Validation then checks only that **zero corrections remain
unresolved** (`corrections.service.ts:249-251`) before moving the card to **PROPRE**.

The filer — the person who saw the problem — is never asked. They find out at publish.

Two designs were considered. This story ships the **cheaper** one and leaves the door open:

1. **Soft verification (this story)** — keep the three statuses; notify the filer when someone else marks
   their correction `corrigé`, show them before/after, give them one-click reopen.
2. **Hard verification (deferred)** — add an `a_verifier` status between `en_cours` and `corrigé`, where
   only the filer or leadership can make the final transition.

Ship 1. Add 2 only if reopens actually happen in practice — the data from this story is what answers that.

## Frontend
- **Notification on resolve**: when a correction is marked `corrigé` by someone **other than its filer**,
  the filer gets a notification — « Votre correction a été marquée corrigée » — deep-linking to
  `/projet/{slug}/revision/{pageId}` with that correction selected. Self-resolution notifies nobody.
- **Before/after inline**: in the notification's target and in the correction row, a `dessin` correction
  shows **crops of its region** from `filedAgainstVersion` and from the resolving version, side by side.
  Regions are normalized 0–1, so the same rectangle transfers to both images with no extra data — this is
  a CSS crop of two existing image URLs, **not** a new derivative or an image-processing job.
- **One-click reopen**: the filer's row gains « Rouvrir » (`.ep-btn-secondary`, compact) which sets the
  status back to `a_corriger` and clears `resolvedInVersion`. It is not destructive, so no confirm step.
- **Unverified marker**: a correction resolved by someone else and not yet acknowledged by its filer shows a
  quiet « en attente de vérification » marker in the list. It does **not** block validation — see Notes.
- « Vu » (acknowledge) clears the marker without changing the status.
- States: filer == resolver (no notification, no marker); the filer has left the project (no marker, no
  blocked flow); a `scenario` correction (no crops — show the quoted text before/after instead).
- Breakpoints ~375 / ~768 / ~1280: the two crops stack vertically under ~768px.

## Backend
- **Schema**:
  ```prisma
  model Correction {
    resolvedById String?  @db.Uuid
    resolvedBy   Account? @relation("CorrectionResolver", fields: [resolvedById], references: [id], onDelete: SetNull)
    verifiedAt   DateTime?
    @@index([resolvedById])
  }
  ```
  Migration `add_correction_verification`. Nullable; existing rows are simply unverified and unmarked.
  FK indexed per the repo DB rule.
- **PATCH /corrections/{id}** (existing) stamps `resolvedById` on a transition to `corrigé` and clears it
  (with `verifiedAt`) on a reopen. Gate unchanged: « Corrections » + author-or-assignee.
- **Reopen** is the existing status route with `status: 'a_corriger'` — **no new endpoint**. Widen the
  author-or-assignee rule by exactly one case: the **filer** may always reopen their own correction.
- **POST /corrections/{id}/verify** — set `verifiedAt`. **Filer only** (403 otherwise); `409` if the
  correction is not currently `corrigé`; idempotent when already verified.
- **Notification**: reuse the existing `project_activity` type with `refId` = the correction id — **do not
  add a `NotifType` enum value** for this (an enum migration for one message is not worth it; revisit if
  the notification centre needs to filter these separately). Fan-out is best-effort and never fails the
  status change, matching the [[CS-2]] corrections-notify pattern.
- Validation (`POST /pages/{id}/review/validate`) is **unchanged**: still "zero unresolved", still `409`
  with the count. Verification is advisory in this story.

## Acceptance criteria
- Marking a correction `corrigé` notifies its filer; marking your **own** correction `corrigé` notifies nobody.
- The notification deep-links to the review screen with that correction selected and scrolled into view.
- A `dessin` correction shows before/after crops of its region from the filed-against and resolving versions, with no new derivative generated.
- The filer can reopen a correction they did not resolve; status returns to `a_corriger` and `resolvedInVersion` is cleared.
- A member who is neither author, assignee nor filer gets **403** on both the status change and the verify.
- `POST /verify` on a correction that is not `corrigé` returns **409**; calling it twice is idempotent.
- Validation still passes with unverified-but-resolved corrections (advisory, not blocking) — asserted explicitly so a later change to this is a deliberate one.
- The card still advances to PROPRE exactly as before when zero corrections remain unresolved.

## Dependencies
- [[CS-5]] — `Correction`, the status route, the review screen, `filedAgainstVersion` / `resolvedInVersion`.
- [[CS-3]] — `AssetVersion` supplies the two images the crops come from.
- [[F-5]] — the notification centre and its fan-out.
- [[CS-10]] — « Corrections » gates the status change and the verify.

## Notes
- **Deliberately advisory (decide once, here).** Blocking validation on verification would make one absent
  member freeze a chapter. The marker informs; the invariant stays "zero unresolved". If reopens turn out
  to be frequent, the follow-up is the `a_verifier` status — a small enum migration on top of this data,
  not a redesign.
- **No new image work.** The crops are `object-fit` / `background-position` over two URLs already in the
  review payload. If this story grows an image-processing job, it has gone wrong.
- **Filer ≠ author of the fix.** `Correction.authorId` is the filer; `assigneeId` is who is fixing it. The
  new `resolvedById` is who actually pressed the button, which is the fact the notification needs and which
  neither existing column records.
- Out of scope: an `a_verifier` status, per-stage review rounds, and any change to how validation counts.
