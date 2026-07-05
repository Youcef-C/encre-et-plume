// F-22 — on-brand tag chip rendered as a real Next <Link> (keyboard-focusable). Used by the Œuvre,
// Illustration and Galerie tag rows for genre-facet and freetext-hashtag links. Distinct from
// GenreChip, which is remove-only (an onRemove button, never a link).
import Link from 'next/link';

const chipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  background: 'var(--paper)',
  border: '2px solid var(--ink)',
  borderRadius: 5,
  padding: '3px 10px',
  fontSize: 12,
  fontWeight: 700,
  color: 'var(--ink)',
  textDecoration: 'none',
};

export default function TagChipLink({
  href,
  label,
  ariaLabel,
}: {
  href: string;
  label: string;
  ariaLabel: string;
}) {
  // Hover/focus fill (matches the prototype's nav `style-hover` fill) via the shared .ep-tag-chip rule.
  return (
    <Link href={href} aria-label={ariaLabel} className="ep-tag-chip" style={chipStyle}>
      {label}
    </Link>
  );
}
