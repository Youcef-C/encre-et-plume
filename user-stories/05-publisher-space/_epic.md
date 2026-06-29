# Epic PE — Publisher Space ("Espace éditeur")

Tools for verified publishers (the "maisons d'édition" such as Kana, Glénat, Kazé)
to scout creators already validated by readers, act on audience data, and sign
contracts. The platform's revenue comes from a percentage of signed contracts.

## Personas
- **Publisher/Editor** — role `editor`, requires admin verification ([[AD-3]]). Primary user of this space.
- **Editorial staff** — role `maintainer`, works inside a publisher org ([[PE-7]]).
- **Creator** — the talent being scouted and contracted.
- **Admin** — verifies editors and oversees branded contests.

## Stories
- [[PE-1]] — Editor space access (role-gated entry)
- [[PE-2]] — Talent radar "Radar de talents"
- [[PE-3]] — Shortlist talents
- [[PE-4]] — Propose a contract "Proposer un contrat"
- [[PE-5]] — Trends "Tendances"
- [[PE-6]] — Branded contests "Lancer un concours"
- [[PE-7]] — Editorial board "Rédaction"

## Revenue model
Signed contracts ([[PE-4]]) are the billable event; the platform takes a
percentage of each signature. Surfaced to publishers/admins via [[MR-5]].

## Cross-epic dependencies
- [[F-1]] Account · [[F-2]] Roles · [[F-3]] Profile · [[F-5]] Notifications
- [[DR-3]] Work page · [[MC-9]] Messaging · [[PUB-7]] Contest participation
- [[MR-5]] Revenue dashboard · [[AD-3]] Editor verification · [[AD-9]] Contest admin
