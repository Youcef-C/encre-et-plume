// Shared inline SVG icon set — the platform never uses emojis (user rule);
// every pictogram is drawn here with chunky strokes matching the bold ink borders.
import type { CSSProperties, ReactNode } from 'react';

type IconProps = { size?: number; style?: CSSProperties; className?: string };

function Svg({
  size = 18,
  style,
  className,
  filled = false,
  children,
}: IconProps & { filled?: boolean; children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ display: 'block', flexShrink: 0, ...style }}
    >
      {children}
    </svg>
  );
}

export function ChevronLeftIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <polyline points="14.5 5 8 12 14.5 19" />
    </Svg>
  );
}

export function ChevronRightIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <polyline points="9.5 5 16 12 9.5 19" />
    </Svg>
  );
}

export function CrownIcon(p: IconProps) {
  return (
    <Svg {...p} filled>
      <path d="M3 8l4.5 3.5L12 5l4.5 6.5L21 8l-2 11H5L3 8z" />
    </Svg>
  );
}

export function HeartIcon(p: IconProps) {
  return (
    <Svg {...p} filled>
      <path d="M12 20.5C7 16.5 3.5 13.4 3.5 9.6 3.5 7 5.5 5 8 5c1.6 0 3 .8 4 2.1C13 5.8 14.4 5 16 5c2.5 0 4.5 2 4.5 4.6 0 3.8-3.5 6.9-8.5 10.9z" />
    </Svg>
  );
}

export function BrushIcon(p: IconProps) {
  return (
    <Svg {...p} filled>
      <path d="M20.5 3.5c-3 1-7.5 5.5-9.5 8l1.5 1.5c2.5-2 7-6.5 8-9.5z" />
      <path d="M9.5 13.5c-1.5-.5-3.1.2-3.6 1.7-.4 1.2-1 2-2.1 2.4 1.3 1.4 3.4 1.8 5 1 1.4-.6 2-2.3 1.4-3.7z" />
    </Svg>
  );
}

export function PenNibIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3c3 2 5 5 5 8l-5 10L7 11c0-3 2-6 5-8z" />
      <circle cx="12" cy="11" r="1.6" />
      <path d="M12 12.6V17" />
    </Svg>
  );
}

/**
 * CS-10 — the ✒ / 🖌 glyphs the prototype draws next to a creator's name, as icons. Hoisted here
 * (round 2, N6) so the members card and the revenue-split card share one definition.
 */
export function CreatorRoleIcon({ role, size = 12 }: { role: string; size?: number }) {
  if (role === 'dessinateur' || role === 'dessinatrice') return <BrushIcon size={size} style={{ display: 'inline' }} />;
  if (role === 'scenariste') return <PenNibIcon size={size} style={{ display: 'inline' }} />;
  return null;
}

export function MailIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="M3.5 7l8.5 6 8.5-6" />
    </Svg>
  );
}

// MC-3: open-envelope glyph for the "Invitations" (received collab proposals) entry.
export function InviteIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 9l9-5.5L21 9v9a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      <path d="M3 9l9 6 9-6" />
    </Svg>
  );
}

export function UserIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20c1.5-3.5 4.2-5 7.5-5s6 1.5 7.5 5" />
    </Svg>
  );
}

// MC-8: two-figure "network / contacts" glyph for the avatar-menu entry.
export function UsersIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="9" cy="8" r="3.4" />
      <path d="M3.5 20c1.2-3 3.3-4.4 5.5-4.4S13.3 17 14.5 20" />
      <path d="M15.5 5.2A3.2 3.2 0 0119 8.4a3.2 3.2 0 01-1.6 2.8" />
      <path d="M17 15.8c1.9.3 3.4 1.7 4.5 4.2" />
    </Svg>
  );
}

export function PenIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 013 3L8 19l-4 1z" />
      <path d="M14.5 6.5l3 3" />
    </Svg>
  );
}

export function InboxIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3v8m0 0l3.5-3.5M12 11L8.5 7.5" />
      <path d="M4 13v5a2 2 0 002 2h12a2 2 0 002-2v-5" />
    </Svg>
  );
}

export function GearIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1" />
    </Svg>
  );
}

export function StarIcon(p: IconProps) {
  return (
    <Svg {...p} filled>
      <path d="M12 3l2.7 5.8 6.3.8-4.6 4.4 1.2 6.2-5.6-3.1-5.6 3.1 1.2-6.2L3 9.6l6.3-.8L12 3z" />
    </Svg>
  );
}

export function DiamondIcon(p: IconProps) {
  return (
    <Svg {...p} filled>
      <path d="M12 3l7 9-7 9-7-9 7-9z" />
    </Svg>
  );
}

export function WarningIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3.5L21.5 20h-19L12 3.5z" />
      <path d="M12 10v4.5" />
      <path d="M12 17.3v.2" />
    </Svg>
  );
}

export function FlagIcon(p: IconProps) {
  return (
    <Svg {...p} filled>
      <path d="M6 3.5v17" fill="none" />
      <path d="M6 4.5c4-2 8 2 12 0v8c-4 2-8-2-12 0v-8z" />
    </Svg>
  );
}

export function CircleDotIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function MenuIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 6.5h16M4 12h16M4 17.5h16" />
    </Svg>
  );
}

export function XIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Svg>
  );
}

// DR-2 — catalog "Découvrir" icons (replace the prototype's ⌕ ✓ 📖 ↑ ○ glyphs).

export function SearchIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5L21 21" />
    </Svg>
  );
}

// F-22 — hashtag glyph for the Galerie freetext tag filter (distinct from the SearchIcon `q` input).
export function TagIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M9.5 4L7.5 20" />
      <path d="M16.5 4L14.5 20" />
      <path d="M4.5 9H20" />
      <path d="M4 15H19.5" />
    </Svg>
  );
}

export function CheckIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <polyline points="4.5 12.5 9.5 17.5 19.5 6.5" />
    </Svg>
  );
}

export function BookIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 5.5c2.5-1.5 5.5-1.5 8 0v13c-2.5-1.5-5.5-1.5-8 0v-13z" />
      <path d="M20 5.5c-2.5-1.5-5.5-1.5-8 0v13c2.5-1.5 5.5-1.5 8 0v-13z" />
    </Svg>
  );
}

export function ArrowUpIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 19V5M6 11l6-6 6 6" />
    </Svg>
  );
}

export function CircleIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8.5" />
    </Svg>
  );
}

// DR-3 — work page "Œuvre" icons (replace the prototype's ＋ ↗ 🛡 ⛔ glyphs).

export function PlusIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function ShareIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M7 17L17 7M9 7h8v8" />
    </Svg>
  );
}

export function ShieldIcon(p: IconProps) {
  return (
    <Svg {...p} filled>
      <path d="M12 3l7 3v5.5c0 5-3 8.2-7 9.5-4-1.3-7-4.5-7-9.5V6l7-3z" />
    </Svg>
  );
}

export function BanIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M6.5 6.5l11 11" />
    </Svg>
  );
}

// DR-4 — reader "Lecteur" icons (replace the prototype's ⛶ ◳ ▾ « » glyphs).

export function FullscreenIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M8 4H4.5V8M16 4h3.5v4M8 20H4.5v-4M16 20h3.5v-4" />
    </Svg>
  );
}

export function StudioIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M13.5 4v6h6" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function CaretDownIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <polyline points="5.5 9 12 15.5 18.5 9" />
    </Svg>
  );
}

export function CollapseLeftIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <polyline points="16 5 9.5 12 16 19" />
      <polyline points="10.5 5 4 12 10.5 19" />
    </Svg>
  );
}

export function CollapseRightIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <polyline points="8 5 14.5 12 8 19" />
      <polyline points="13.5 5 20 12 13.5 19" />
    </Svg>
  );
}

// DR-5 — gallery "Galerie" icons (replace the prototype's 👁 🔥 glyphs — no-emoji rule).

export function EyeIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </Svg>
  );
}

export function FlameIcon(p: IconProps) {
  return (
    <Svg {...p} filled>
      <path d="M12 2.5c1 3-2.5 4.5-2.5 8a2.5 2.5 0 005 0c1.2 1 2 2.6 2 4.2 0 3.2-2.9 5.8-6.5 5.8S3.5 17.9 3.5 14.7c0-3.4 2.3-5.7 4-7.6.9-1 1.7-2.4 1.7-3.6.7.6 1.9 1.7 2.8 3z" />
    </Svg>
  );
}

// MC-11 — salon "Le Comptoir" header tile (replaces the prototype's 💬 glyph — no-emoji rule).
export function ChatIcon(p: IconProps) {
  return (
    <Svg {...p} filled>
      <path d="M4 4.5h16a1 1 0 011 1V16a1 1 0 01-1 1H9l-4 3.5V17H4a1 1 0 01-1-1V5.5a1 1 0 011-1z" />
    </Svg>
  );
}

// A stack of sheets — marks a collection ("a set" of illustrations).
export function LayersIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3l9 5-9 5-9-5 9-5z" />
      <path d="M3 12l9 5 9-5" />
      <path d="M3 16l9 5 9-5" />
    </Svg>
  );
}

// A single framed image — marks one standalone illustration ("one piece").
export function ImageIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="M20.5 15l-5-5-8 8.5" />
    </Svg>
  );
}

// CS-2 — file-type tag icon (📄 substitute): a page with a folded corner + text lines.
export function FileTextIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M14 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5z" />
      <polyline points="14 3.5 14 8.5 19 8.5" />
      <line x1="8.5" y1="13" x2="15.5" y2="13" />
      <line x1="8.5" y1="16.5" x2="15.5" y2="16.5" />
    </Svg>
  );
}

// CS-2 card modal — deadline (ÉCHÉANCE) glyph: a month grid with a torn-off header.
export function CalendarIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <line x1="3.5" y1="9.5" x2="20.5" y2="9.5" />
      <line x1="8" y1="3" x2="8" y2="6.5" />
      <line x1="16" y1="3" x2="16" y2="6.5" />
    </Svg>
  );
}

// CS-2 card modal — checklist glyph: a checkmark next to two task lines.
export function ChecklistIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <polyline points="3.5 8 5.5 10 9 6" />
      <polyline points="3.5 16 5.5 18 9 14" />
      <line x1="12" y1="8" x2="20.5" y2="8" />
      <line x1="12" y1="16" x2="20.5" y2="16" />
    </Svg>
  );
}

// CS-2 (iter 2) — "Supprimer" glyph for the Fichiers grid card: a lidded waste bin.
export function TrashIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <polyline points="4 6.5 20 6.5" />
      <path d="M8.5 6.5V4.5a1.5 1.5 0 0 1 1.5-1.5h4a1.5 1.5 0 0 1 1.5 1.5v2" />
      <path d="M6 6.5l1 13a1.6 1.6 0 0 0 1.6 1.5h6.8a1.6 1.6 0 0 0 1.6-1.5l1-13" />
      <line x1="10" y1="10.5" x2="10" y2="17.5" />
      <line x1="14" y1="10.5" x2="14" y2="17.5" />
    </Svg>
  );
}

// CS-6 D-3 — the arrangement grid's drag handle. The prototype draws the « ⠿ » braille glyph
// (proto 1707-1717); every pictogram in this app is an icon instead (user rule), so this is the same
// six ink dots at the same visual weight. `aria-hidden` like every icon — the wrapping control
// carries the « Réorganiser » label.
export function DragHandleIcon(p: IconProps) {
  return (
    <Svg {...p} filled>
      <circle cx="9" cy="6" r="1.7" stroke="none" />
      <circle cx="15" cy="6" r="1.7" stroke="none" />
      <circle cx="9" cy="12" r="1.7" stroke="none" />
      <circle cx="15" cy="12" r="1.7" stroke="none" />
      <circle cx="9" cy="18" r="1.7" stroke="none" />
      <circle cx="15" cy="18" r="1.7" stroke="none" />
    </Svg>
  );
}

// CS-4 (iter 2) — rich-text toolbar pictograms (strike, quote, link, undo/redo, highlight, lists,
// text colour, clear formatting, alignment). Chunky ink strokes; no emojis.

export function StrikeIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 12h16" />
      <path d="M7 8.5C7 6 9 5 12 5c2.2 0 3.6.6 4.4 1.6" />
      <path d="M9 15.5c.7 1.5 2 2.5 4 2.5 2.8 0 4-1.2 4-3" />
    </Svg>
  );
}

export function QuoteIcon(p: IconProps) {
  return (
    <Svg {...p} filled>
      <path d="M6 6c-1.8 0-3 1.3-3 3.3 0 1.9 1.2 3.2 3 3.2.4 0 .8-.1 1-.2-.3 1.3-1.3 2.2-2.6 2.6l.7 1.4C10.4 15.5 12 13 12 9.9 12 7.4 10.6 6 8.4 6H6zm10 0c-1.8 0-3 1.3-3 3.3 0 1.9 1.2 3.2 3 3.2.4 0 .8-.1 1-.2-.3 1.3-1.3 2.2-2.6 2.6l.7 1.4C20.4 15.5 22 13 22 9.9 22 7.4 20.6 6 18.4 6H16z" />
    </Svg>
  );
}

export function LinkIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M9.5 14.5l5-5" />
      <path d="M8 11L6 13a3.5 3.5 0 005 5l2-2" />
      <path d="M16 13l2-2a3.5 3.5 0 00-5-5l-2 2" />
    </Svg>
  );
}

export function LinkOffIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M8 11L6 13a3.5 3.5 0 005 5l1-1" />
      <path d="M16 13l2-2a3.5 3.5 0 00-5-5l-1 1" />
      <path d="M4 4l16 16" />
    </Svg>
  );
}

export function UndoIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M7 7L3.5 10.5 7 14" />
      <path d="M3.5 10.5H14a5.5 5.5 0 015.5 5.5v0a5.5 5.5 0 01-5.5 5.5H8" />
    </Svg>
  );
}

export function RedoIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M17 7l3.5 3.5L17 14" />
      <path d="M20.5 10.5H10A5.5 5.5 0 004.5 16v0A5.5 5.5 0 0010 21.5h6" />
    </Svg>
  );
}

export function HighlightIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 20h6" />
      <path d="M12.5 5.5l6 6-5 5-6-6z" fill="currentColor" stroke="none" opacity="0.25" />
      <path d="M12.5 5.5l6 6-5 5-6-6z" />
      <path d="M15 3l6 6" />
    </Svg>
  );
}

export function ListBulletIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M9 6.5h11M9 12h11M9 17.5h11" />
      <circle cx="4.5" cy="6.5" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="17.5" r="1.3" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function ListOrderedIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M10 6.5h10M10 12h10M10 17.5h10" />
      <path d="M4 5v3.5M3 5h1M3 8.5h2" strokeWidth={1.8} />
      <path d="M3 14.5c0-.7.6-1.2 1.3-1.2s1.2.5 1.2 1.1c0 .5-.3.8-.8 1.2L3 17.5h2.5" strokeWidth={1.8} />
    </Svg>
  );
}

export function PaletteIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 3.5c-4.7 0-8.5 3.6-8.5 8 0 2.7 2.1 4.5 4.5 4.5H10c1 0 1.5.9 1.1 1.8-.3.7-.1 1.6.9 1.7 4.7 0 8-3.8 8-8.5 0-4.7-3.7-7.5-8-7.5z" />
      <circle cx="7.5" cy="11" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="11" cy="8" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="8.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="16.5" cy="12" r="1.1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function ClearFormatIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M8 6h11" />
      <path d="M13.5 6l-3 9" />
      <path d="M6 20h6" />
      <path d="M4 4l16 16" />
    </Svg>
  );
}

export function AlignLeftIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 6.5h16M4 12h10M4 17.5h13" />
    </Svg>
  );
}

// CS-5 (iter 5) — "Enregistrer" glyph: a floppy disk (save). Chunky ink strokes; no emoji.
export function SaveIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4.5 4.5h11l4 4v11a1 1 0 0 1-1 1H4.5a1 1 0 0 1-1-1v-14a1 1 0 0 1 1-1z" />
      <path d="M8 4.5v5h7v-5" />
      <rect x="8" y="13" width="8" height="6.5" />
    </Svg>
  );
}

// CS-5 (iter 5) — "Comparer les versions" glyph: two overlapping sheets (side-by-side compare).
export function CompareIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3.5" y="5.5" width="10" height="14" rx="1.5" />
      <path d="M16 8.5h3a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-6" />
    </Svg>
  );
}

// CS-3 — import/drop-zone glyph + "Télécharger" (replaces the prototype's ⤓): a downward arrow
// dropping into a tray.
export function DownloadIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <line x1="12" y1="3.5" x2="12" y2="15" />
      <polyline points="7 10.5 12 15.5 17 10.5" />
      <path d="M4.5 18.5v1a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-1" />
    </Svg>
  );
}
