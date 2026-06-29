# CS-4 — Real-time collaborative script editor "Éditeur"

**As a** Writer, **I want** a real-time collaborative editor structured by planche and case, **so that** my co-author and I can write a script together and feed it straight into publishing.

> Screen(s): "Éditeur" · Priority: Must · Fidelity: Explicit

## Frontend
- **Header**: back link "‹ Projet"; work title; chapter selector "Chapitre 2 — La rencontre ▾"; autosave indicator "Enregistré ✓"; collaborator avatars + "2 en ligne"; "Partager" button.
- **Toolbar**: "Style ▾", "B", "I", "U", "≣" (align), "• Liste", "📄 Ouvrir un fichier ▾", "＋ Commentaire".
- **File dropdown** ("📄 Ouvrir un fichier ▾"): scenario-ch5.docx, scenario-ch6.txt, notes-perso.txt, "＋ Importer un fichier…" ([[CS-3]]).
- **Canvas**: structured planche document — "Planche 5 / 40" header, with "CASE 1 / 2 / 3" blocks each holding a description + dialogue. Live named collaborator cursors (Yuki / Camille colored carets + selection highlights).
- **Right sidebar**: "En ligne" presence list; "Commentaires" anchored per-case; "Camille écrit…" typing indicator.
- States: connecting / reconnecting banner; saving vs "Enregistré ✓"; presence join/leave; empty planche; read-only fallback if connection lost; conflict handled by merge (CRDT) not error.
- Validation: planche/case structure preserved on edit; comment requires non-empty text.
- Accessibility: toolbar buttons labelled; collaborator cursors announce author; comments navigable by keyboard; chapter/file dropdowns keyboard-operable.

## Backend
- **GET /pages/{id}/document** — structured planche document `{ plancheNo, total, cases: [{ no, description, dialogue, comments[] }] }`.
- **Real-time channel** (WebSocket / CRDT): broadcast presence, named cursors, selections, typing indicators; apply collaborative edits; periodic autosave.
- **PATCH /pages/{id}/document** — persist autosaved document state.
- **GET /projects/{slug}/assets** — populate file dropdown (filter to texte/scenario) → [[CS-3]].
- **POST /pages/{id}/cases/{caseNo}/comments** — add a per-case comment.
- **POST /pages/{id}/share** — share/grant edit access ("Partager").
- Entities: **Planche/Document** `{ pageId, plancheNo, total, cases[] }`; **Case** `{ no, description, dialogue }`; **Comment** `{ id, caseNo, authorId, text, createdAt }`.
- Business rules: structured planche→case→dialogue model is directly exploitable for publishing ([[PUB-1]]); autosave debounced; presence expires on disconnect.
- Authorization: only members with edit permission ([[CS-10]]); share respects project visibility.
- Side effects: autosave updates the page version badge ([[CS-2]]).

## Dependencies
- [[CS-3]] — file dropdown / "＋ Importer un fichier…".
- [[CS-2]] — editor opened per page/chapter; autosave reflects in kanban.
- [[CS-10]] — edit permission.
- [[PUB-1]] — structured script consumed at publish.

## Notes
- Explicit: header, toolbar, file dropdown contents, planche/case canvas, live cursors, sidebar presence/comments/typing. CRDT vs OT left tech-agnostic.
