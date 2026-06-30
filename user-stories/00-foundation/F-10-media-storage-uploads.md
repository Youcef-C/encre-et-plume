# F-10 — Media storage, uploads & delivery (object storage + CDN)

**As a** platform operator (serving creators and readers), **I want** a unified media system — direct-to-storage uploads, an image-processing pipeline, and CDN delivery with public/signed URLs — **so that** the platform stores and serves images (chapter pages, illustrations, covers, avatars, attachments) reliably and cheaply at scale without the app servers becoming a bandwidth bottleneck.

> Screen(s): none of its own (technical/infra); reusable upload control surfaced by consuming stories · Priority: Must · Fidelity: Inferred

## Frontend
- A reusable **upload control** (drag-drop + file picker) that consuming stories embed (avatar/cover in [[F-3]], chapter pages in [[PUB-1]], illustrations in [[DR-5]], attachments in [[MC-9]]/[[CS-8]], project assets in [[CS-3]]). It: validates type/size client-side, requests a presigned URL, **uploads bytes directly to storage** (with progress), then calls finalize.
- States: idle / selecting; uploading (progress %); processing ("optimisation…") while variants generate; ready (preview); error + retry (oversize, wrong type, network).
- Rendering: images use plain `<img>` with a responsive **`srcset`** built from CDN variant URLs (the prototype/replica uses `<img>`; the CDN does optimization — no `next/image`). Always provide `alt`; show the existing halftone/dot fallback when an image is missing.
- Accessibility: upload control labelled, keyboard-operable, progress announced politely; images have meaningful `alt`.
- Responsive per the Responsive convention. French UI copy verbatim.

## Backend
- **Object storage (S3-compatible, provider-agnostic)**: bytes live in S3 / Cloudflare R2 / MinIO via `@aws-sdk/client-s3` + `s3-request-presigner` — never in Postgres or on the app server. Concrete provider chosen at deploy via env. **CDN** in front of the bucket for delivery.
- Entity **Media**: `{ id, ownerId, kind (avatar|cover|portfolio|chapter_page|illustration|attachment|article|contest), bucketKey, contentType, size, width?, height?, status (pending|ready|failed), variants (Json: thumb/web/orig URLs), visibility (public|private), createdAt }`. Generalises [[CS-3]]'s per-project `Asset` (which references a `Media`).
- **Presigned direct upload**:
  - **POST /media/uploads** — caller-authed; validates `kind`, `contentType` (allowlist), declared `size` (cap), and ownership; returns a short-lived **presigned PUT** + a `mediaId` (status `pending`).
  - Client PUTs the bytes straight to storage (not through the API).
  - **POST /media/{id}/finalize** — verifies the object exists + matches the declared type/size, validates real dimensions, strips EXIF, then **enqueues an `image-processing` job** ([[F-8]]) to generate thumbnail/responsive variants + WebP/AVIF; sets `status` `ready` (or `failed` → dead-letter).
- **Delivery**: `visibility: public` → public CDN URL on `Media.variants`. `visibility: private` (premium chapters, private DM/[[CS-8]] attachments) → **GET /media/{id}/url** issues a short-lived **signed URL**, gated by the same authz that protects the underlying resource (participant/owner/subscriber/staff-oversight [[AD-11]]).
- **MediaService** seam — `requestUpload()`, `finalize()`, `signedUrl()` — exported so consuming services attach media to their entities (the existing URL columns `Account.avatar` / `Profile.coverImage` / `PortfolioItem.image` store the ready public URL; `mediaId` references are the long-term form).
- Security/validation (enforced at presign AND finalize, never trust the client): content-type allowlist, size + dimension limits, reject/sanitise SVG (XSS), EXIF strip, optional malware/content-moderation scan hook, per-user upload rate-limiting (Redis). Orphan-cleanup job removes `pending` media never finalized.
- Authorization: any authenticated user may upload media they own; signed-URL issuance follows the protected resource's rules ([[F-2]]).
- Config (`.env.example`): `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `CDN_BASE_URL`, `MEDIA_SIGNED_URL_TTL`.

## Dependencies
- [[F-8]] — the reserved `image-processing` queue generates variants/transcodes on finalize.
- [[F-1]] — authenticated session owns uploads; [[F-2]] — authz for private signed URLs.
- Consumed by — **uploaders**: [[F-3]], [[CS-3]], [[CS-6]], [[PUB-1]], [[DR-5]], [[MC-4]], [[MC-5]], [[MC-9]], [[CS-8]]; **display consumers**: [[DR-1]], [[DR-3]], [[DR-4]], [[DR-6]], [[DR-7]], [[CS-7]], [[F-4]], [[F-7]], [[MC-1]], [[MC-2]], [[MC-8]], [[PE-2]], [[MR-3]], [[AD-11]].

## Notes
- Inferred/technical: no prototype frame; an infra enabler. Ships early so image-bearing stories build on it; pairs with [[F-8]] (processing) and generalises [[CS-3]]'s `Asset`.
- The app **never proxies image bytes** — uploads go client→storage (presigned), reads go client→CDN. App servers stay stateless and are not a media bandwidth bottleneck.
- **Gaps to fill when those stories are built**: [[PUB-8]]/[[AD-8]] (news article) and [[PE-6]] (contest) define no image field yet — they should adopt `Media` (article hero / contest banner-logo) rather than inventing new columns.
- **Privacy (RGPD)**: strip EXIF/geolocation on ingest; private attachments are never public; signed URLs are short-lived; deleting an entity must also delete (or tombstone) its `Media`.
