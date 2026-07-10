# CS-13 — Modify an illustration "Modifier une illustration"

**As a** Creator, **I want** a dedicated page to edit one of my illustrations — including replacing its image — reachable both from a full page and the existing edit modal, **so that** I can update any illustration I own from wherever I manage my work.

> Screen(s): "Modifier une illustration" (`data-page="modifierillus"`, route `/illustration/:id/modifier`) + the existing edit modal on the illustration detail page (`data-screen="illustration"`) · Priority: Must · Fidelity: **Inferred** (the prototype draws the illustration edit modal fields; the full-page variant and the image-replace control are induced — user-specified 2026-07-10) · Epic: Creation Studio

## Context
The illustration detail page ([[DR-6]]) already has an owner-only **"Modifier" modal** (`EditIllustrationForm`) editing Titre / Catégorie / Description / Hashtags / Outils / Licence / Visibilité — but it cannot replace the image. [[CS-12]]'s "Mes projets" cards (standalone illustrations and collection members) forward-link their **Modifier** action to `/illustration/:id/modifier`, a page that does not exist yet. This story adds that page and gives **both** surfaces image-replace, via one shared form component so they never drift.

## Frontend

- **Shared edit form** (user-specified 2026-07-10): extract the fields of today's `EditIllustrationForm` into a shared **`IllustrationEditFields`** component used by **both** the detail-page modal and the new page, so the two never diverge. Fields (verbatim, unchanged from the modal): **Titre** (required), **Catégorie** (`OnBrandSelect`, GALLERY categories), **Description** (textarea), **Hashtags** (`HashtagChipsInput`, free descriptive chips — NOT [[F-20]] genres), **Outils**, **Licence** (`OnBrandSelect`: © Tous droits réservés / CC BY / CC BY-NC), **Visibilité** (`OnBrandSelect`: Public / Abonnés / Privé).
- **Image replace** (user-specified 2026-07-10): add an on-brand **image-slot** to `IllustrationEditFields` (reuse the [[CS-2]] INFOS / prototype `image-slot` "Déposez…" component: shows the current image, drag-drop or click-to-browse a replacement). The chosen file uploads **direct-to-storage via an [[F-10]] presigned URL** (the API never proxies bytes); on save the returned media URL becomes the illustration's `image`. **No crop.** Allowed types + max size/dimensions per [[F-10]]; a pending/failed upload shows the current image + retry. Present in **both** the modal and the page.
- **New page `/illustration/:id/modifier`** (`data-page="modifierillus"`): owner-only full page. Header "Modifier l'illustration" + a back affordance to `/illustration/:id`. Renders `IllustrationEditFields`; footer **"Annuler"** (→ back) and **"Enregistrer"** (→ PATCH, then return to the detail page). Manga-zine design system (3px ink borders, hard offset shadows, tokens), responsive 375/768/1280.
- **Detail-page modal unchanged in trigger**: the illustration detail page's owner "Modifier" button still opens the modal (now rendering the shared fields **with** the image-slot). [[CS-12]] cards' "Modifier" → the new page (already wired in CS-12).
- **States / validation / a11y**: title required (blocks save, inline error); save loading spinner; error toast on failure (form stays, values preserved); image-slot upload progress/error; the page and modal trap focus / are keyboard-operable; the image-slot is labelled; non-owner or unknown id → **404 / redirect** (never render another user's edit form).

## Backend

- **PATCH `/illustrations/:id`** (extend the existing endpoint) — accept a new optional **`image`** field (the media reference produced by the [[F-10]] presigned upload) alongside the existing editable fields. On success the illustration's `image` is replaced. Response returns the updated illustration detail (so the modal/page and the detail page re-render).
- **F-10 presigned upload**: reuse the existing presigned-URL seam used for [[CS-2]] covers to obtain a direct-to-storage upload target for the new illustration image (allowlist content types, cap size/dimensions, strip EXIF). The API never proxies the bytes.
- **Authorization**: only the **owner** (`Illustration.artistId === caller`) may load `/illustration/:id/modifier` data or PATCH the illustration (incl. the image). Enforce server-side ([[F-1]] / [[F-2]]); never trust the client. Non-owner → 403/404.
- **Validation**: `title` non-empty; `category` / `license` / `visibility` constrained to their enums; `image` must reference a media the caller just uploaded (owner-scoped), correct type/size.

## Bundled DR-6 change (same page — recorded on [[DR-6]])
- **"Plus de cet·te artiste"** box: show a **max of 4** images (cap `getMoreByArtist` at 4). Add a **"Voir tout"** link inside the box (same pattern as the collections box's "Voir tout") → the **catalogue filtered to that artist's illustrations**. The PM resolves the exact target route: reuse an existing galerie/catalogue artist filter if one exists, else the artist's profile illustrations view ([[F-3]] / [[DR-5]]).

## Dependencies
- [[DR-6]] — the illustration detail page + its edit modal this story extends; the "Plus de cet·te artiste" change.
- [[CS-12]] — the "Mes projets" cards whose "Modifier" action targets `/illustration/:id/modifier`.
- [[DR-5]] / [[CS-3]] — illustration publish/import (the illustration entity + its fields).
- [[F-10]] — presigned direct-to-storage image upload.
- [[F-1]] / [[F-2]] — authenticated owner; server-side authz.
- [[DR-12]] — collection members are illustrations edited through the same page.

## Notes
- **Fidelity**: the edit modal's **fields** are drawn (Explicit, owned by [[DR-6]]); the **full page**, the **image-replace control**, and the **"Voir tout"** on "Plus de cet·te artiste" are **induced** (user-specified 2026-07-10). Grade against these deviations.
- **Ponytail**: reuse the existing `EditIllustrationForm` internals (extract, don't rewrite), the existing PATCH endpoint (extend, don't add a new one), and the [[F-10]] cover-upload seam (reuse for the illustration image). Smallest correct diff.
- **Open (PM)**: the "Voir tout" catalogue-by-artist route — confirm whether a galerie artist filter exists or whether to point at the artist profile.
