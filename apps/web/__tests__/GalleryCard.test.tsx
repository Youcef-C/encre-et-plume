// DR-5 FE-9 — gallery card. Replica of prototype GALERIE grid cards (lines 632-645).
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { GalleryIllustrationCard } from '@encre-et-plume/shared';
import GalleryCard from '../components/galerie/GalleryCard';

const card: GalleryIllustrationCard = {
  id: 'dr5-illus-1',
  title: 'Lames de Brume — Ch.2',
  artistName: 'Yuki Moreau',
  artistSlug: 'dr1-yuki-moreau',
  category: 'process',
  categoryLabel: 'Process',
  likeCount: 3400,
  thumbnail: null,
  is18plus: false,
};

const cardNoSlug: GalleryIllustrationCard = {
  ...card,
  id: 'dr5-illus-2',
  artistName: 'Hugo Da Silva',
  artistSlug: null,
};

describe('GalleryCard (DR-5 FE-9)', () => {
  it('renders title, artist and formatted hearts', () => {
    render(<GalleryCard illustration={card} onQuickPreview={() => {}} />);
    expect(screen.getByText('Lames de Brume — Ch.2')).toBeInTheDocument();
    expect(screen.getByText(/Yuki Moreau/)).toBeInTheDocument();
    expect(screen.getByText(/3,4k/)).toBeInTheDocument();
  });

  it('hearts count has an accessible label', () => {
    render(<GalleryCard illustration={card} onQuickPreview={() => {}} />);
    expect(screen.getByLabelText("3,4k j'aime")).toBeInTheDocument();
  });

  it('tile image has alt text equal to the title', () => {
    render(<GalleryCard illustration={card} onQuickPreview={() => {}} />);
    expect(screen.getByRole('img', { name: card.title })).toBeInTheDocument();
  });

  it('card links to /illustration/:id', () => {
    render(<GalleryCard illustration={card} onQuickPreview={() => {}} />);
    expect(screen.getByRole('link', { name: new RegExp(card.title) })).toHaveAttribute(
      'href',
      '/illustration/dr5-illus-1',
    );
  });

  it('artist name links to /:artistSlug when present', () => {
    render(<GalleryCard illustration={card} onQuickPreview={() => {}} />);
    expect(screen.getByRole('link', { name: 'Yuki Moreau' })).toHaveAttribute('href', '/dr1-yuki-moreau');
  });

  it('artist name renders as plain text when no artistSlug', () => {
    render(<GalleryCard illustration={cardNoSlug} onQuickPreview={() => {}} />);
    expect(screen.queryByRole('link', { name: 'Hugo Da Silva' })).not.toBeInTheDocument();
    expect(screen.getByText(/Hugo Da Silva/)).toBeInTheDocument();
  });

  it('the eye "Aperçu rapide" button opens the quick preview without navigating', () => {
    const onQuickPreview = vi.fn();
    render(<GalleryCard illustration={card} onQuickPreview={onQuickPreview} />);
    fireEvent.click(screen.getByRole('button', { name: 'Aperçu rapide de Lames de Brume — Ch.2' }));
    expect(onQuickPreview).toHaveBeenCalledWith('dr5-illus-1');
  });

  // ── DR-10: 18+ blur + badge ──────────────────────────────────────────────────

  it('blurs the thumbnail and shows an "18+" badge for an 18+ illustration', () => {
    render(<GalleryCard illustration={{ ...card, is18plus: true }} onQuickPreview={() => {}} />);
    expect(screen.getByLabelText('Illustration 18+')).toBeInTheDocument();
  });

  it('does not blur or badge a non-18+ illustration', () => {
    render(<GalleryCard illustration={card} onQuickPreview={() => {}} />);
    expect(screen.queryByLabelText('Illustration 18+')).not.toBeInTheDocument();
  });

  // QA round-1 regression: the 18+ overlay must never change the cover box's own declared
  // height, or its title/meta siblings shift into the next grid row.
  it('QA round-1 regression: the cover box keeps its exact 230px height when is18plus (no stretch)', () => {
    render(<GalleryCard illustration={{ ...card, is18plus: true }} onQuickPreview={() => {}} />);
    expect(screen.getByTestId('gallery-cover')).toHaveStyle({ height: '230px' });
  });
});
