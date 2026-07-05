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

export function MailIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="M3.5 7l8.5 6 8.5-6" />
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
