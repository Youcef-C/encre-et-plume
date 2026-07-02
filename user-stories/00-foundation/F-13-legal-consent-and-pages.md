# F-13 — Legal consent & pages (CGU, confidentialité, cookies)

**As a** platform operator, **I want** users to accept the CGU at signup, public legal pages, and a CNIL-compliant cookie-consent banner, **so that** the platform meets French/EU legal obligations before it serves its first user.

> Screen(s): none drawn (legal pages, footer, cookie banner — to be designed) · Priority: Must · Fidelity: Inferred

## Frontend
- **Signup consent** ([[F-1]]): required checkbox "J'accepte les [Conditions générales d'utilisation] et la [Politique de confidentialité]." with links opening the pages; submit disabled until checked; inline error "Vous devez accepter les conditions pour créer un compte."
- **Legal pages** (public, static content routes): "Conditions générales d'utilisation" (`/cgu`), "Politique de confidentialité" (`/confidentialite`), "Mentions légales" (`/mentions-legales`). Content is versioned copy provided by the team; pages render markdown/HTML in the manga-zine layout.
- **Cookie-consent banner** (CNIL): shown on first visit before any non-essential cookie/tracker is set; actions "Tout accepter", "Tout refuser", "Personnaliser" (per-category toggles: essentiels — always on, mesure d'audience, contenus tiers). Choice persisted; re-openable via a "Gérer les cookies" footer link. Refusing must be as easy as accepting (equal prominence).
- **Global legal footer** on every page: links CGU · Politique de confidentialité · Mentions légales · Gérer les cookies · © Encre & Plume.
- **Re-consent**: when the CGU version changes, prompt logged-in users once to re-accept before continuing.
- States: banner unseen/accepted/refused/customised; legal page loading/error; signup checkbox error.
- Accessibility: banner is a labelled dialog reachable by keyboard and NOT focus-stealing on every page; checkbox properly labelled; footer links named.
- Responsive: banner and footer usable at 375/768/1280 px; banner never blocks the whole viewport on mobile.

## Backend
- Entity **ConsentRecord**: `{ id, accountId, document (cgu|privacy), version, acceptedAt, ip? }` — one row per acceptance; append-only. Index `(accountId, document)`.
- Entity **LegalDocument** *(or versioned static content)*: `{ id, kind (cgu|privacy|mentions), version, content, publishedAt }` — served to the pages; current version = latest published.
- **GET /legal/:kind** — public; returns the current published document `{ kind, version, content, publishedAt }`.
- **POST /consents** — authenticated; `{ document, version }`; records acceptance (signup calls this transactionally with account creation).
- Business rules: signup requires an acceptance of the **current** CGU version; when a new CGU version is published, users lacking a `ConsentRecord` for it are prompted to re-accept. Cookie choices are **client-side** (no account needed) stored in a consent cookie/localStorage; no non-essential script loads before an explicit accept.
- Validation: `document`/`kind` from allowed enums; `version` must match a published document.
- Authorization: legal pages public; consent write requires the authenticated account it is recorded for.
- Side effects: `ActionLogService.record()` emits `consent_given` ([[AD-10]]).
- Shared contracts in `packages/shared/src/legal.ts` (`LegalKind`, `LegalDocumentDto`, `ConsentDto`) + barrel export.

## Dependencies
- [[F-1]] — signup form hosts the consent checkbox; acceptance recorded at account creation.
- [[F-4]] — every page's layout gains the legal footer.
- [[AD-10]] — consent events logged.

## Notes
- Inferred: no prototype frame or footer exists in the prototype — the footer and banner are new surfaces built from manga-zine tokens; keep them visually quiet.
- Compliance floor (CNIL/RGPD): consent before non-essential cookies, refuse as easy as accept, choices revocable, mentions légales publicly reachable. Legal **copy** itself is provided by the team, not invented by the pipeline — ship with clearly-marked placeholder copy if not yet delivered.
- Editorial authoring of legal documents can reuse the [[AD-8]] article tooling pattern later; a seeded/static document is enough for this story.
