'use client';

// CS-5 FR10 — shared A4 + prose render for "a version's content", used by the editor's read-only
// older-version view (FR5). (r4: the revision-page ScenarioDiff caller was removed — the revision page
// is dessin-only now.) It re-scopes the editor's own CSS: `.ep-planche-canvas .ep-case-block` is the A4
// sheet frame, `.ep-planche-canvas .ProseMirror …` the prose typography (globals.css). A version's HTML
// is `editor.getHTML()`, which already carries the `.ep-case-block` markup; a plain-text-origin version
// (server-wrapped to <p>s) is dropped onto a synthetic sheet so it still reads as an A4 page.
// ponytail: static view has no live pagination → `--ep-page-h` falls back to one A4 page (1131px). Fine.
//
// SECURITY INVARIANT — this is a `dangerouslySetInnerHTML` sink. In-app scenario HTML is
// attacker-controlled (any project member can POST arbitrary version content), so `html` MUST already
// be server-sanitized. The ONLY authorized source is the review endpoint, whose single-version payload
// (`selected.fromHtml`) is passed through `sanitizeScenarioHtml` server-side (media.service.ts); the
// sole caller — EditorClient's older-version view (via api.getReview) — obeys this. NEVER pass raw
// `editor.getHTML()` / live Yjs content here; route it through the sanitizing endpoint first. Live
// editing renders through TipTap's schema (ProseMirror), not this sink.
import type { MouseEventHandler } from 'react';

export default function VersionSheet({
  html,
  className,
  onClick,
}: {
  html: string;
  className?: string;
  /** Optional delegated click handler on the sheet wrapper. */
  onClick?: MouseEventHandler<HTMLDivElement>;
}) {
  const hasSheet = /ep-case-block|data-case-block/.test(html);
  const inner = hasSheet ? html : `<div class="ep-case-block">${html}</div>`;
  return (
    <div className={`ep-planche-canvas ep-a4-sheet ep-version-sheet${className ? ` ${className}` : ''}`} onClick={onClick}>
      <div className="ProseMirror" dangerouslySetInnerHTML={{ __html: inner }} />
    </div>
  );
}
