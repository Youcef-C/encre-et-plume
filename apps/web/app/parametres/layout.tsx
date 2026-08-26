import type { Metadata } from 'next';

// F-24 F5 — private surface: nothing under /parametres may be indexed. The metadata lives in the layout
// because the page below is a client component (or there are several pages sharing the rule);
// robots.txt disallows the same prefix.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function ParametresLayout({ children }: { children: React.ReactNode }) {
  return children;
}
