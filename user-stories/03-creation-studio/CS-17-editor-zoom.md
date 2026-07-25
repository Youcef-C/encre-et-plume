# CS-17 — Zoom in the editor "Zoom dans l'éditeur"

**As a** Writer, **I want** to zoom the editor's page canvas in and out, **so that** I can read fine text comfortably or step back to see the whole A4 page.

> Screen(s): "Éditeur" ([[CS-4]]) · Priority: Should · Fidelity: **Inferred** (no drawn frame — an editor affordance; grade against the criteria)

## Frontend
- **Zoom control** in the editor toolbar/footer: a **−** / **percentage readout** / **＋** cluster, plus **"Ajuster"** (fit-to-width) and reset-to-**100%** (clicking the readout). On-brand controls (no bare native inputs; SVG icons from `components/icons.tsx`).
- **Keyboard**: `Cmd/Ctrl + =` / `Cmd/Ctrl + -` to zoom, `Cmd/Ctrl + 0` to reset to 100%; `Cmd/Ctrl + scroll` to zoom at the pointer (desktop). Standard shortcuts, so browser-zoom isn't hijacked destructively.
- **What scales**: only the **A4 writing sheet / canvas** (`.ep-case-block` + its content), not the header/toolbar/sidebar chrome. Pagination stays correct at any zoom (the page geometry scales with it); the caret-follow scroll still works.
- **Bounds**: clamp **50%–200%** in sensible steps (e.g. 25% increments); the readout shows the current level. Horizontal overflow of a zoomed-in sheet scrolls **inside its own container**, never the page body.
- **Persistence**: remember the last zoom **per user** (localStorage, e.g. `ep:editorZoom`), restored on reopen; **reset to 100%** is the clear/default.
- **Responsive**: on mobile/tablet the fit-to-width default keeps the sheet readable; controls stay reachable (≥44px targets); pinch-zoom is not blocked.
- States: at min/max the corresponding button is disabled; the readout is a live region for a11y.
- Accessibility: zoom buttons labelled ("Zoom avant/arrière", "Ajuster", "100 %"); the current level announced on change; controls keyboard-operable.

## Backend
- **None.** Zoom is **view state**, persisted client-side only (localStorage) — no endpoint, no schema. (Ponytail: nothing to store server-side.)

## Acceptance criteria
- The −/＋/readout, "Ajuster", and reset controls change the sheet's zoom within 50–200% and update the readout; keyboard shortcuts (`Cmd/Ctrl +/-/0`) do the same.
- Only the writing sheet scales — the toolbar/sidebar/header stay fixed; pagination and caret-follow remain correct at every zoom level; no page-body horizontal overflow.
- The last zoom level persists per user across reopen; reset returns to 100%.
- At 50% the zoom-out button is disabled; at 200% the zoom-in button is disabled.

## Dependencies
- [[CS-4]] — the editor canvas, pagination, and caret-follow scroll this scales.

## Notes
- **No Delete applies**: this is pure **view-state** (a zoom level), not an entity — there is nothing to delete/remove; "reset to 100%" is the equivalent of clearing it. (Called out explicitly since Delete is otherwise a default expectation.)
- **Ponytail**: CSS `transform: scale()` / `zoom` on the sheet wrapper + a localStorage-backed number; no server, no new dependency. Keep pagination measurement zoom-aware (measure in unscaled space or divide by the zoom factor) so a zoomed sheet still paginates correctly.
