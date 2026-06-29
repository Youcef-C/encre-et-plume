# CS-5 — Nemu review & corrections "Révision de nemu & corrections"

**As an** Illustrator, **I want** to pin correction requests onto a nemu page and track their status, **so that** scenario and drawing fixes are resolved before the page goes clean.

> Screen(s): "Révision de nemu & corrections" (wireframe) · Priority: Must · Fidelity: Explicit

## Frontend
- **Header**: "Nemu · « Lames de Brume » — Planche 3" + status pill "En révision" + collaborator avatars.
- **Left**: nemu page showing cases, with numbered pin markers anchored to cases. Pin color by status: red = "à corriger", green = "corrigé". Pins are placeable on the page.
- **Right — "Demandes de correction"**:
  - Segmented filter "Toutes / Scénario / Dessin".
  - List items: pin number, author, case reference, type chip ("Dessin" / "Scénario"), status "À corriger / En cours / ✓ Corrigé", and description text.
- **Bottom composer**: "Décrire la correction…" text input + Type toggle "Scénario / Dessin" + "Demander" button.
- Entry points: kanban card "⚑ corrections" icon / "Voir les corrections →" link ([[CS-2]]).
- States: empty ("Aucune demande"); placing-pin mode; submitting a request; status-change in progress; loading nemu; error on save. Selecting a list item highlights its pin and vice versa.
- Validation: description required to "Demander"; a type must be selected; pin must be anchored to a case.
- Accessibility: pins are focusable buttons with status + number announced; filter is a segmented radiogroup; list rows link to their pin; composer labelled with current type.

## Backend
- **GET /pages/{id}/nemu** — nemu planche + pins + correction requests.
- **POST /pages/{id}/pins** — annotation pin `{ planche, case, x, y, type: "scenario"|"dessin" }`.
- **POST /pages/{id}/corrections** — correction request `{ pinId, type, text, authorId }`.
- **PATCH /corrections/{id}** — update status (`a_corriger|en_cours|corrige`).
- **GET .../corrections?type=&status=** — filter by type/status.
- Entities: **Pin** `{ id, pageId, caseRef, x, y, type, status }`; **CorrectionRequest** `{ id, pinId, type, text, authorId, status, createdAt }`.
- Business rules: pin color derives from correction status; status lifecycle à_corriger → en_cours → corrigé.
- Authorization: project members; author and assignee can change status.
- Side effects: new request / status change notifies the relevant collaborator ([[F-5]]); resolving may unblock the kanban "Corrections" → "PROPRE" transition ([[CS-2]]).

## Dependencies
- [[CS-2]] — reached via "⚑ corrections"; status feeds kanban.
- [[F-5]] — collaborator notifications.

## Notes
- Explicit: header, pinned nemu, request list with filter, composer with type toggle. Pin coordinate model inferred minimally (x/y anchor) from the wireframe pins.
