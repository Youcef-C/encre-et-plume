// DR-10 FE-5 — blur + "18+" badge treatment for a listing card's cover/thumbnail.
//
// QA round-1 fix: this no longer WRAPS the cover element. Wrapping forced a `height:'100%'`
// sizing div around the cover, which — inside the catalog/gallery CSS grids (`align-items:
// stretch` by default) — resolved against the *stretched grid-row-track height*, not the cover's
// own intended height, pushing every card's title ~53px into the next row. Instead, render this
// as a self-contained `position:absolute` overlay (blur backdrop + badge) placed as a SIBLING
// inside the cover element the caller already gives `position:relative` + an explicit size — it
// sources its box from that existing, unmodified ancestor and can never change its size or push
// any sibling. Renders `null` (zero DOM nodes) when not triggered.
export default function Cover18Overlay({
  is18plus,
  cleared,
  label,
}: {
  is18plus: boolean;
  cleared: boolean;
  /** Accessible name announcing the rating, e.g. "Œuvre 18+" / "Illustration 18+". */
  label: string;
}) {
  if (!is18plus || cleared) return null;

  return (
    <>
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          zIndex: 1,
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
        }}
      />
      <span
        role="img"
        aria-label={label}
        style={{
          position: 'absolute',
          top: 9,
          left: 9,
          zIndex: 2,
          fontSize: 11,
          fontWeight: 700,
          background: 'var(--ink)',
          color: '#fff',
          border: '3px solid var(--ink)',
          borderRadius: 5,
          padding: '2px 9px',
        }}
      >
        18+
      </span>
    </>
  );
}
