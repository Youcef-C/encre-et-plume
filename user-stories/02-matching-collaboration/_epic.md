# Epic 02 — Matching & Collaboration

## Goal

Help "Encre & Plume" creators find the right collaborators and work together. This epic covers the partner directory ("Trouver un·e partenaire") and its algorithmic match suggestions, the collaboration invite flow ("Proposer une collab"), the open-call board ("Appels à projets") with posting and applying, the applicant management views ("Mes candidatures" / "Candidatures reçues"), the contacts & connections network ("Contacts & connexions"), and the cross-cutting floating messaging widget. Together these screens form the social-graph layer that turns lone writers (scénaristes) and illustrators (dessinateur·rices) into project teams that feed the creation studio and publishing flows.

## Personas

- **Creator** — a Writer (scénariste) or Illustrator (dessinateur·rice); primary actor across this epic.
- **Writer (scénariste)** — seeks an illustrator for a script.
- **Illustrator (dessinateur·rice)** — seeks a writer / project to draw.
- **Reader** — can connect with and message creators via contacts and messaging.
- **Admin** — can ban abusive accounts that surface here ([[AD-6]]).

## Stories (ordered)

1. [[MC-1]] — Partner directory "Trouver un·e partenaire"
2. [[MC-2]] — Algorithmic match suggestions
3. [[MC-3]] — Collaboration invite "Proposer une collab"
4. [[MC-4]] — Post a call "Appels à projets"
5. [[MC-5]] — Apply to a call "Candidater"
6. [[MC-6]] — My applications "Mes candidatures"
7. [[MC-7]] — Received applicants "Candidatures reçues"
8. [[MC-8]] — Contacts & connexions
9. [[MC-9]] — Messaging (floating widget)
10. [[MC-10]] — Block & mute users

## Key cross-epic dependencies

- [[F-1]] Account / [[F-2]] Roles — identity, creator role (scénariste/dessinateur·rice) gating most actions.
- [[F-3]] Profile — portfolio, style/genre tags, and the data feeding match scoring.
- [[F-5]] Notifications — invites, applications, connection requests, and unread message counts.
- [[F-7]] Search — scoped people search inside contacts.
- [[CS-1]] Create project / [[CS-2]] Workspace / [[CS-8]] Project chat — invites and calls seed and link to projects; group chat is shared with messaging.
- [[PUB-4]] Follow — adjacent relationship surfaced in suggestions.
