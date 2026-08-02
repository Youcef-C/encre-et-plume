# CS-11 — Collaboration rights & licensing agreement

**As a** Creator collaborating on a project, **I want** the team to record who owns the IP, under what licence the platform publishes it, and each co-author's explicit consent, **so that** publishing and publisher contracts rest on an agreed rights base instead of assumptions.

> Screen(s): none drawn (a "Droits & licence" section in "Gérer le groupe") · Priority: Should · Fidelity: Inferred

## Frontend
- **"Droits & licence"** section inside "Gérer le groupe" ([[CS-10]]):
  - **Propriété**: ownership model selector — "Copropriété à parts égales", "Copropriété selon les parts de revenus", "Propriétaire unique" (with owner picker) — plus a free-text "Précisions" field.
  - **Licence de publication**: what the platform may do, presented as fixed clauses with checkboxes: publication sur Encre & Plume (always on), extraits pour la promotion, participation aux concours ([[PUB-7]]), visibilité dans l'espace éditeurs ([[PE-2]]).
  - **Consentements**: one row per co-author with status "En attente" / "Accepté le {date}"; each co-author signs from their own session ("J'accepte les termes ci-dessus" + confirm).
- Publishing guard: "Publier" ([[PUB-1]]/[[CS-9]]) is blocked while any co-author's consent is pending — "Tous les co-auteur·rices doivent accepter les droits & licence avant la publication." (solo projects: the owner's acceptance is implicit at first publish).
- Changing terms resets consents to "En attente" with a clear warning before saving.
- States: unset (defaults proposed), pending consents, all-signed ("Accord complet ✓"), editing warning, loading/error.
- Accessibility: clause list readable as a document; consent action clearly tied to the terms; status not color-only.
- Responsive: section usable at 375/768/1280 px inside the workspace.

## Backend
- Entity **RightsAgreement**: `{ id, projectId, ownershipModel (equal|by_revenue_share|sole), soleOwnerId?, clauses (Json), notes?, version, updatedAt }` — one active agreement per project, versioned on change.
- Entity **RightsConsent**: `{ id, agreementId, memberId, acceptedAt, agreementVersion }` — a consent binds to a version; version bump invalidates.
- **GET /projects/{slug}/rights** — agreement + per-member consent status.
- **PATCH /projects/{slug}/rights** — update terms; bumps `version`, clears consents (audited).
- **POST /projects/{slug}/rights/consent** — the calling member accepts the current version.
- Business rules: publish endpoints ([[PUB-1]], [[CS-9]]) verify all current members have a consent for the **current** version (server-side guard); members added later ([[CS-10]]) must consent before the next publish; the platform-publication clause is non-removable while the work is published.
- Validation: `ownershipModel` from enum; `soleOwnerId` must be a member; consent only by the member themself.
- Authorization: terms editable by owner/manage-group permission ([[CS-10]]); consent strictly self; reads for project members ([[F-2]]).
- Side effects: consent requests notify co-authors ([[F-5]]); `ActionLogService.record()` emits `rights_agreement_updated` / `rights_consented` ([[AD-10]]); the signed agreement is visible context for a publisher contract ([[PE-4]]).
- Shared contracts in `packages/shared/src/rights.ts` (enums, DTOs) + barrel export.

## Attribution / droit moral — a former co-author stays credited (user-specified, 2026-08-02)

**As a** co-author who has left or been removed from a project, **I want** to remain credited on the
parts I actually made, **so that** my portfolio and reputation survive a fallout with the group.

- **Credits are per CONTRIBUTION, not per current membership.** A chapter, planche or page records who
  authored it; the work's credit block is built from that, so it cannot be rewritten by changing who is
  in the group today. This is the same shape as [[CS-10]]'s non-retroactive revenue split: the record of
  what happened is not editable by whoever holds the keys now.
- The credit block distinguishes **current** co-authors from those who **also contributed** (former),
  and names what they worked on where the data supports it («chapitres 1–10»).
- [[CS-10]] revocation **retires** a `WorkCreator` row, never deletes it. The work keeps appearing on the
  former co-author's profile.
- **Removing a credit is not an available operation** — not via the group screen, not via the API. The
  only path is [[AD-5]]/[[AD-*]] moderation, for impersonation or a credit added in bad faith, and it is
  logged like any other moderation act.
- The [[CS-11]] licence agreement governs **exploitation** rights. It does **not** govern attribution:
  an agreement cannot trade away a co-author's credit, so the consent flow must not present it as
  negotiable.

> **Why this is a hard constraint, not a courtesy.** Under French copyright law the *droit moral* — and
> specifically the *droit de paternité* (the right to be named as author) — is **perpétuel, inaliénable
> et imprescriptible** (CPI art. L121-1): an author cannot waive it even by contract. A French
> manga-creator platform that lets a group delete someone's credit is therefore not merely being unfair,
> it is offering an operation the law does not permit its users to perform. Treat this as a design
> constraint and **have it confirmed by counsel** before the licence copy is finalised — this note is a
> reason to check, not a legal opinion.

**Related defect, already recorded:** works created through the app get **no `WorkCreator` row at all**
(see `.claude/pipeline/_seed-coherence-pass.md`), so the credit block is empty from birth. Attribution
cannot be protected before it is populated — fix that first.

## Dependencies
- [[CS-10]] — host surface; complements the revenue split (money ≠ rights) and supplies the member list.
- [[PUB-1]] / [[CS-9]] — publish is gated on full consent.
- [[PE-4]] — publisher contracts reference the recorded rights base.
- [[F-5]] — consent-request notifications.

## Notes
- Inferred: no prototype frame — the section reuses "Gérer le groupe" patterns and manga-zine tokens.
- Deliberately NOT a legal-document generator: it records a structured agreement + explicit consents. Real contract templates/legal copy are a team/legal deliverable; the clause vocabulary above is the conservative floor.
