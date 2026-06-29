# PE-3 — Shortlist talents

**As a** Publisher/Editor, **I want** to save talents to a private shortlist, **so that** my house can track candidates we are considering.

> Screen(s): "Radar de talents" — "★ Shortlist" action · Priority: Should · Fidelity: Explicit

## Frontend
- "★ Shortlist" button on each talent row toggles membership. Outlined star = not shortlisted; filled star "★" = shortlisted.
- Optimistic toggle with rollback on failure; toast on error ("Impossible d'enregistrer dans la shortlist.").
- A shortlist view lists saved talents (reuses radar row layout); empty state: "Votre shortlist est vide."
- States: not shortlisted / shortlisted / pending toggle. Loading: disabled star while request in flight.
- Accessibility: button exposes pressed state (aria-pressed) and a label that changes between "Ajouter à la shortlist" and "Retirer de la shortlist".

## Backend
- `POST /editeur/shortlist` — body `{ talentId }`; adds entry for the editor's org.
- `DELETE /editeur/shortlist/{talentId}` — removes entry.
- `GET /editeur/shortlist` — returns the org's shortlisted talents.
- Entities: ShortlistEntry { id, editorOrgId, talentId, addedBy (user id), addedAt }. Uniqueness on (editorOrgId, talentId).
- Business rules: shortlist is **private to the editor org** — not visible to talents, other editors, or the public. Idempotent add (no duplicates).
- Validation: `talentId` must reference an existing, radar-eligible creator.
- Authorization: verified editors only ([[PE-1]]); entries scoped to caller's org.
- Side effects: none beyond persistence (no notification to the talent).

## Dependencies
- [[PE-1]] — access gate.
- [[PE-2]] — radar provides the talents and the "★ Shortlist" action.

## Notes
- Explicit: the "★ Shortlist" action label.
- Inferred: dedicated shortlist view, org-scoping, toast/empty copy, and idempotency.
