# CS-14 — Œuvre completion status "En cours / Terminé"

**As a** Creator, **I want** to mark a series œuvre (Manga / Roman) as **"En cours"** or **"Terminé"** from its edit/Modifier page, **so that** readers and the catalogue know whether the work is finished.

> Screen(s): the project workspace **INFOS** editor ([[CS-2]], `data-projview="infos"`) + the public "Œuvre" page ([[DR-3]]) · Priority: Should · Fidelity: **Inferred** (induced — user-specified 2026-07-10; not drawn in the prototype's INFOS view) · Epic: Creation Studio

## Context
`Work.complete` (boolean) already exists — `true` = "Œuvres complètes" / **Terminé**, `false` = **En cours** — and it feeds the STATUT catalog filter. What's missing is the **UI to set it** on the creator's edit surface. This story adds that toggle. Originally recorded as an amendment on [[CS-2]]; extracted here as its own story (build it with, or after, CS-2).

## Frontend
- **STATUT toggle on the INFOS editor** ([[CS-2]]): a single-select **"En cours / Terminé"** control (on-brand — `OnBrandSelect` or an on-brand segmented toggle, never a native control), backed by `Work.complete` (`false` → "En cours", `true` → "Terminé"). **Auto-saves** like the other INFOS fields (no "Appliquer" button; "Enregistré ✓" indicator).
- **Series only**: shown for **`Manga`**, **`Roman`**, and **`One-shot`** `Work`s; **hidden for `Illustration(s)`** œuvres/collections ([[DR-12]]) — they have no completion axis.
- **One-shot rule**: a **One-shot** is always considered **Terminé once published** — the control reflects that (Terminé, and either read-only or defaulted) rather than letting a published one-shot read "En cours".
- The chosen value **surfaces on the public "Œuvre" page** ([[DR-3]]) hero/meta (e.g. a "Terminé" badge) and drives the STATUT catalogue filter.
- **States / a11y**: owner/member only sees the control; save in-flight + "Enregistré ✓"; error → revert + inline message; labelled, keyboard-operable; responsive.

## Backend
- **PATCH the œuvre** (extend the existing [[CS-2]] INFOS auto-save endpoint, or the Work update seam) to accept `complete: boolean`. Owner/member only ([[F-1]] / [[F-2]], server-side — never trust the client). 
- **Validation / rules**: reject setting `complete` on an **`Illustration(s)`** `Work` (400 — no completion axis). A published **One-shot** is normalized to `complete = true` (server enforces the one-shot rule regardless of client input).
- `Work.complete` already renders on [[DR-3]] and the catalogue STATUT filter — no new read model needed; confirm both reflect the edited value.

## Acceptance criteria
- A **Manga/Roman** creator toggles "En cours ↔ Terminé" on INFOS; it auto-saves (`Work.complete`) and shows "Enregistré ✓"; the public Œuvre page + STATUT catalogue filter reflect it.
- The control is **hidden** for an `Illustration(s)` œuvre/collection; the server **rejects** `complete` on such a Work.
- A **published one-shot** reads **Terminé** (never "En cours").
- Only the owner/member can change it; a non-owner cannot (server-enforced).

## Dependencies
- [[CS-2]] — the workspace **INFOS** editor (the surface this toggle lives on) + its auto-save.
- [[DR-3]] — the public "Œuvre" page where "Terminé" surfaces.
- [[DR-12]] — Illustration(s) collections are excluded from the completion axis.
- [[F-1]] / [[F-2]] — authenticated owner; server-side authz.

## Notes
- **Induced** (user-specified 2026-07-10): not drawn in the prototype's INFOS view (`data-projview="infos"` draws only TITRE / SYNOPSIS / HASHTAGS + collaboration toggle + reviews) — grade against these criteria, reusing the INFOS auto-save + design-system controls.
- **Ponytail**: `Work.complete` + the STATUT filter already exist; this is a UI toggle + a `complete` field on the existing INFOS save, plus the series-only gating and the one-shot normalization. Smallest correct diff.
