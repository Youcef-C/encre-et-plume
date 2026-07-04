// DR-6 FE-T3 (FE-4) — meta block: title, byline (artist · category · ♥), description, hashtag chips.
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { IllustrationDetail } from '@encre-et-plume/shared';
import IllustrationMeta from '../components/illustration/IllustrationMeta';

const detail: IllustrationDetail = {
  id: 'dr5-illus-1',
  title: 'Pluie de Néons',
  description: 'Encrage traditionnel rehaussé de trames numériques.',
  category: 'process',
  categoryLabel: 'Process',
  hashtags: ['encre', 'noir', 'néon', 'pluie'],
  image: null,
  dimensionsLabel: '2480 × 3508',
  tools: 'Encre · CSP',
  license: '© Tous droits réservés',
  likeCount: 3400,
  publishedAt: '2026-06-12T00:00:00.000Z',
  artist: { id: 'a1', name: 'Yuki Moreau', slug: 'dr1-yuki-moreau', role: 'Dessinateur·rice', city: 'Lyon', avatar: null },
};

describe('IllustrationMeta (DR-6 FE-4)', () => {
  it('renders title, byline, description and hashtag chips', () => {
    render(<IllustrationMeta detail={detail} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Pluie de Néons' })).toBeInTheDocument();
    expect(screen.getByText('Yuki Moreau')).toBeInTheDocument();
    expect(screen.getByText('Process')).toBeInTheDocument();
    expect(screen.getByText(/3,4k/)).toBeInTheDocument();
    expect(screen.getByText(detail.description!)).toBeInTheDocument();
    expect(screen.getByText('#encre')).toBeInTheDocument();
    expect(screen.getByText('#pluie')).toBeInTheDocument();
  });

  it('omits the description paragraph when null', () => {
    render(<IllustrationMeta detail={{ ...detail, description: null }} />);
    expect(screen.queryByText(detail.description!)).not.toBeInTheDocument();
  });
});
