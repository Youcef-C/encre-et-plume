'use client';

// CS-13 FE-1 — shared, fully-controlled edit fields for an illustration. Extracted verbatim from
// EditIllustrationForm so the detail-page modal AND the /illustration/:id/modifier page render the
// exact same fields (they can never drift). Parents own the state; these are the field blocks plus
// an F-10 image-replace slot (reusing UploadControl — no new upload code, no crop).
import {
  GALLERY_CATEGORIES,
  ILLUSTRATION_LICENSES,
  type GalleryCategoryKey,
  type IllustrationDetail,
  type IllustrationLicense,
  type IllustrationVisibility,
  type MediaResponse,
  type UpdateIllustrationRequest,
} from '@encre-et-plume/shared';
import OnBrandSelect from '../form/OnBrandSelect';
import HashtagChipsInput from '../form/HashtagChipsInput';
import UploadControl from '../UploadControl';

export interface IllustrationEditValues {
  title: string;
  category: GalleryCategoryKey;
  description: string;
  hashtags: string[];
  tools: string;
  license: string;
  visibility: IllustrationVisibility;
  /** Media.id of a freshly-uploaded replacement; null = keep the current image. */
  image: string | null;
}

/** Seed edit state from a loaded detail. Visibility from publishedAt; null licence -> © default. */
export function initialEditValues(detail: IllustrationDetail): IllustrationEditValues {
  return {
    title: detail.title,
    category: detail.category,
    description: detail.description ?? '',
    hashtags: detail.hashtags,
    tools: detail.tools ?? '',
    license: detail.license ?? ILLUSTRATION_LICENSES[0],
    visibility: detail.publishedAt !== null ? 'public' : 'private',
    image: null,
  };
}

/** Build the PATCH body: trim free text, drop-to-null empties, include `image` only when replaced. */
export function buildUpdateRequest(v: IllustrationEditValues): UpdateIllustrationRequest {
  return {
    title: v.title.trim(),
    category: v.category,
    description: v.description.trim() || null,
    hashtags: v.hashtags,
    tools: v.tools.trim() || null,
    license: v.license.trim() || null,
    visibility: v.visibility,
    ...(v.image ? { image: v.image } : {}),
  };
}

const label: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--ink2)',
  letterSpacing: '.02em',
  display: 'block',
  marginBottom: 6,
};
const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '2px solid var(--ink)',
  borderRadius: 8,
  padding: '10px 12px',
  fontSize: 14,
  fontFamily: 'inherit',
  background: 'var(--card)',
  color: 'var(--ink)',
  boxSizing: 'border-box',
};
const field = { marginBottom: 14 };
const errText: React.CSSProperties = { fontSize: 13, color: 'var(--accent)', fontWeight: 700, margin: '8px 0 0' };

export default function IllustrationEditFields({
  detail,
  values,
  onChange,
  titleError,
  onUploadBusyChange,
  idPrefix = 'edit-illus',
}: {
  detail: IllustrationDetail;
  values: IllustrationEditValues;
  onChange: (v: IllustrationEditValues) => void;
  titleError: string | null;
  onUploadBusyChange?: (busy: boolean) => void;
  idPrefix?: string;
}) {
  const set = <K extends keyof IllustrationEditValues>(key: K, value: IllustrationEditValues[K]) =>
    onChange({ ...values, [key]: value });
  const id = (name: string) => `${idPrefix}-${name}`;

  // Keep a legacy licence value (outside the 3-option vocabulary) selectable so the form never
  // silently rewrites it to the first option until the user picks one.
  const licenseInVocab = (ILLUSTRATION_LICENSES as readonly string[]).includes(values.license);
  const licenseOptions: string[] = licenseInVocab
    ? [...ILLUSTRATION_LICENSES]
    : [values.license, ...ILLUSTRATION_LICENSES];

  return (
    <>
      {/* Image replace (F-10) — reuse UploadControl: current image preview, drag-drop/click, presigned
          direct-to-storage PUT, progress + retry, allowlist/size caps. No crop (illustration kind). */}
      <div style={field}>
        <UploadControl
          kind="illustration"
          label="Déposez l’illustration"
          currentUrl={detail.image}
          onUploaded={(m: MediaResponse) => set('image', m.id)}
          onBusyChange={onUploadBusyChange}
        />
      </div>

      {/* Titre */}
      <div style={field}>
        <label htmlFor={id('title')} style={label}>
          Titre
        </label>
        <input
          id={id('title')}
          value={values.title}
          onChange={(e) => set('title', e.target.value)}
          maxLength={120}
          style={inputStyle}
          aria-invalid={!!titleError}
          aria-label="Titre"
        />
        {titleError && (
          <p role="alert" style={errText}>
            {titleError}
          </p>
        )}
      </div>

      {/* Catégorie */}
      <div style={field}>
        <label htmlFor={id('category')} style={label}>
          Catégorie
        </label>
        <OnBrandSelect
          id={id('category')}
          value={values.category}
          onChange={(e) => set('category', e.target.value as GalleryCategoryKey)}
          aria-label="Catégorie"
        >
          {GALLERY_CATEGORIES.map((c) => (
            <option key={c.key} value={c.key}>
              {c.label}
            </option>
          ))}
        </OnBrandSelect>
      </div>

      {/* Description */}
      <div style={field}>
        <label htmlFor={id('desc')} style={label}>
          Description
        </label>
        <textarea
          id={id('desc')}
          value={values.description}
          onChange={(e) => set('description', e.target.value)}
          maxLength={1000}
          rows={3}
          style={{ ...inputStyle, resize: 'vertical' }}
          aria-label="Description"
        />
      </div>

      {/* Hashtags (F-22) */}
      <div style={field}>
        <span style={label}>Hashtags</span>
        <HashtagChipsInput
          value={values.hashtags}
          onChange={(h) => set('hashtags', h)}
          ariaLabel="Hashtags"
          placeholder="#encre #noir…"
        />
      </div>

      {/* Outils */}
      <div style={field}>
        <label htmlFor={id('tools')} style={label}>
          Outils
        </label>
        <input
          id={id('tools')}
          value={values.tools}
          onChange={(e) => set('tools', e.target.value)}
          maxLength={120}
          placeholder="Encre · CSP"
          style={inputStyle}
          aria-label="Outils"
        />
      </div>

      {/* Licence (R3: constrained OnBrandSelect) */}
      <div style={field}>
        <label htmlFor={id('license')} style={label}>
          Licence
        </label>
        <OnBrandSelect
          id={id('license')}
          value={values.license}
          onChange={(e) => set('license', e.target.value as IllustrationLicense)}
          aria-label="Licence"
        >
          {licenseOptions.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </OnBrandSelect>
      </div>

      {/* Visibilité (R4: Publique / Privée only) */}
      <div style={field}>
        <label htmlFor={id('visibility')} style={label}>
          Visibilité
        </label>
        <OnBrandSelect
          id={id('visibility')}
          value={values.visibility}
          onChange={(e) => set('visibility', e.target.value as IllustrationVisibility)}
          aria-label="Visibilité"
        >
          <option value="public">Publique</option>
          <option value="private">Privée</option>
        </OnBrandSelect>
      </div>
    </>
  );
}
