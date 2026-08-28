'use client';

// CS-5 (iter 2, Fb-1) — review screen header, reworked onto the CS-4 EDITOR CHROME (approved deviation
// from the prototype-replica rule for this screen, recorded in plan.md §1). Two sticky rows inside the
// editor card: (1) header row — ‹ Projet, project title, the PageSwitcher, the "En révision" pill,
// member avatars, and the green "Valider les modifications" button; (2) toolbar row — the
// "Fichier : … ▾" picker, the v{from} ↔ v{to} version pair pickers, and the "Ouvrir l'éditeur"
// cross-link. Verbatim French copy kept from round 1. (r4: the Scénario/Dessin toggle is gone — the
// revision page is dessin-only; scenario corrections are managed in the editor as tagged comments.)
import Link from 'next/link';
import type { CSSProperties, Ref } from 'react';
import type { ReviewFileItem, ReviewVersionItem } from '@encre-et-plume/shared';
import OnBrandSelect from '../form/OnBrandSelect';
import PageSwitcher from '../editeur/PageSwitcher';
import { CheckIcon } from '../icons';

export interface ReviewHeaderProps {
  slug: string;
  pageId: string;
  projectTitle: string;
  pageTitle: string;
  files: ReviewFileItem[];
  selectedFile: string;
  onSelectFile: (assetId: string) => void;
  versions: ReviewVersionItem[];
  fromVersion: number;
  toVersion: number;
  onFrom: (v: number) => void;
  onTo: (v: number) => void;
  members: { accountId: string; displayName: string; avatar: string | null }[];
  allCorrige: boolean;
  onValidate: () => void;
  validating: boolean;
  validateError: string | null;
  // CS-25 — number of open corrections filed against a version older than the file's head. 0 = no
  // entry point at all (no empty mode, no dead button).
  triageCount?: number;
  onEnterWalkthrough?: () => void;
  entryRef?: Ref<HTMLButtonElement>;
}

const srOnly: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

export default function ReviewHeader({
  slug,
  pageId,
  projectTitle,
  pageTitle,
  files,
  selectedFile,
  onSelectFile,
  versions,
  fromVersion,
  toVersion,
  onFrom,
  onTo,
  members,
  allCorrige,
  onValidate,
  validating,
  validateError,
  triageCount = 0,
  onEnterWalkthrough,
  entryRef,
}: ReviewHeaderProps) {
  const disabled = !allCorrige || validating;
  return (
    <>
      {/* Kept for the document/a11y title even though the wireframe H1 is gone (Fb-1). */}
      <h1 style={srOnly}>Révision · corrections</h1>

      {/* Header row (EditorHeader-modeled) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', borderBottom: '3px solid var(--ink)', flexWrap: 'wrap' }}>
        <Link href={`/projet/${slug}`} style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink2)', textDecoration: 'none' }}>
          ‹ Projet
        </Link>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 22, textTransform: 'uppercase', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {projectTitle}
        </span>
        <PageSwitcher slug={slug} currentPageId={pageId} label={pageTitle} hrefFor={(id) => `/projet/${slug}/revision/${id}`} />
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', border: '2px solid var(--accent)', borderRadius: 5, padding: '3px 10px' }}>
          En révision
        </span>

        <div style={{ flex: 1 }} />

        {/* Member avatars (halftone-dot placeholder, kanban pattern) */}
        {members.length > 0 && (
          <span style={{ display: 'inline-flex' }} aria-label={`${members.length} collaborateur·rices`}>
            {members.map((m, i) => (
              <span
                key={m.accountId}
                title={m.displayName}
                aria-hidden="true"
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  border: '2px solid var(--ink)',
                  marginLeft: i === 0 ? 0 : -8,
                  background: m.avatar
                    ? `center/cover url(${m.avatar})`
                    : 'var(--tone) radial-gradient(var(--ink) 1.4px,transparent 1.5px) 0 0 / 5px 5px',
                  display: 'block',
                }}
              />
            ))}
          </span>
        )}

        {/* CS-25 (F1) — « Passer en revue (n) »: shown only when a newer version landed on at least
            one still-open correction. Sits left of « Valider les modifications ». */}
        {triageCount > 0 && onEnterWalkthrough && (
          <button
            type="button"
            ref={entryRef}
            className="ep-btn-primary"
            style={{ fontSize: 13, fontWeight: 700, borderRadius: 6, padding: '7px 15px', minHeight: 40, cursor: 'pointer', fontFamily: 'inherit' }}
            onClick={onEnterWalkthrough}
          >
            {`Passer en revue (${triageCount})`}
          </button>
        )}

        {/* Valider les modifications — app button idiom (.ep-btn-validate); enabled only when every
            correction is corrigé. */}
        <button
          type="button"
          className="ep-btn-validate"
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          onClick={() => !disabled && onValidate()}
          disabled={disabled}
          aria-disabled={disabled}
          title={allCorrige ? undefined : 'Toutes les corrections doivent être corrigées'}
        >
          {validating ? (
            'Validation…'
          ) : (
            <>
              <CheckIcon size={14} />
              Valider les modifications
            </>
          )}
        </button>
      </div>

      {/* Toolbar row (RichTextToolbar-modeled strip). r4: dessin-only — no surface toggle. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '10px 18px', borderBottom: '3px solid var(--ink)', flexWrap: 'wrap', background: 'var(--paper)' }}>
        {/* Fichier : … ▾ picker (dessin files only, pre-filtered by ReviewClient) */}
        {files.length > 0 && (
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 700 }}>
            <span>Fichier :</span>
            <OnBrandSelect aria-label="Choisir le fichier à réviser" value={selectedFile} onChange={(e) => onSelectFile(e.target.value)} style={{ minWidth: 170 }}>
              {files.map((f) => (
                <option key={f.assetId} value={f.assetId}>
                  {f.filename}
                </option>
              ))}
            </OnBrandSelect>
          </label>
        )}

        {/* Version pair pickers (v{from} ↔ v{to}) — default vN-1 ↔ vN (Fb-4), overridable here */}
        {versions.length > 0 && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700 }}>
            <OnBrandSelect aria-label="Version révisée (précédente)" value={String(fromVersion)} onChange={(e) => onFrom(Number(e.target.value))} style={{ minWidth: 74 }}>
              {versions.map((v) => (
                <option key={v.version} value={String(v.version)}>{`v${v.version}`}</option>
              ))}
            </OnBrandSelect>
            <span aria-hidden="true" style={{ color: 'var(--ink2)' }}>↔</span>
            <OnBrandSelect aria-label="Nouvelle version" value={String(toVersion)} onChange={(e) => onTo(Number(e.target.value))} style={{ minWidth: 74 }}>
              {versions.map((v) => (
                <option key={v.version} value={String(v.version)}>{`v${v.version}`}</option>
              ))}
            </OnBrandSelect>
          </span>
        )}

        <div style={{ flex: 1 }} />

        {/* Cross-link into the live editor (the editor toolbar links back to Révision) */}
        <Link
          href={`/projet/${slug}/editeur/${pageId}`}
          style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink2)', textDecoration: 'none', border: '2px solid var(--ink)', borderRadius: 6, padding: '5px 12px', minHeight: 32, display: 'inline-flex', alignItems: 'center' }}
        >
          Ouvrir l’éditeur →
        </Link>
      </div>

      {validateError && (
        <div role="alert" style={{ padding: '8px 18px', color: 'var(--accent)', fontSize: 13, fontWeight: 700, borderBottom: '3px solid var(--ink)', background: 'var(--card)' }}>
          {validateError}
        </div>
      )}
    </>
  );
}
