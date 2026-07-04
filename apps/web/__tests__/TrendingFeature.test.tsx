// DR-5 Round 2 regression — both trending feature cards must carry the "Aperçu rapide" quick-
// preview affordance (user note 2026-07-04: rank #1 was missing it, only rank #2 had it).
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { GalleryFeatureCard } from '@encre-et-plume/shared';
import TrendingFeature from '../components/galerie/TrendingFeature';

const items: GalleryFeatureCard[] = [
  {
    id: 'i1',
    title: 'Pluie de Néons',
    artistName: 'Yuki Moreau',
    artistSlug: 'dr1-yuki-moreau',
    category: 'couvertures',
    categoryLabel: 'Couvertures',
    likeCount: 12400,
    thumbnail: null,
    rank: 1,
  },
  {
    id: 'i2',
    title: 'Onibi · Esprit du feu',
    artistName: 'Inès Khelifi',
    artistSlug: null,
    category: 'personnages',
    categoryLabel: 'Personnages',
    likeCount: 9700,
    thumbnail: null,
    rank: 2,
  },
];

describe('TrendingFeature (DR-5 Round 2 — both cards get the eye button)', () => {
  it('renders a quick-preview eye button on the rank-1 card', () => {
    render(<TrendingFeature items={items} onQuickPreview={() => {}} />);
    expect(screen.getByRole('button', { name: 'Aperçu rapide de Pluie de Néons' })).toBeInTheDocument();
  });

  it('renders a quick-preview eye button on the rank-2 card', () => {
    render(<TrendingFeature items={items} onQuickPreview={() => {}} />);
    expect(screen.getByRole('button', { name: 'Aperçu rapide de Onibi · Esprit du feu' })).toBeInTheDocument();
  });

  it('clicking the rank-1 eye button opens its preview without navigating', () => {
    const onQuickPreview = vi.fn();
    render(<TrendingFeature items={items} onQuickPreview={onQuickPreview} />);
    fireEvent.click(screen.getByRole('button', { name: 'Aperçu rapide de Pluie de Néons' }));
    expect(onQuickPreview).toHaveBeenCalledWith('i1');
  });
});
