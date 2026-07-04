// DR-5 FE-9 — gallery results grid: loading/empty/error/ready states.
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { GalleryIllustrationCard } from '@encre-et-plume/shared';
import GalleryGrid from '../components/galerie/GalleryGrid';

const items: GalleryIllustrationCard[] = [
  {
    id: 'dr5-illus-1',
    title: 'Lames de Brume — Ch.2',
    artistName: 'Yuki Moreau',
    artistSlug: 'dr1-yuki-moreau',
    category: 'process',
    categoryLabel: 'Process',
    likeCount: 3400,
    thumbnail: null,
  },
];

describe('GalleryGrid (DR-5 FE-9)', () => {
  it('loading state shows a skeleton grid with a status role', () => {
    render(
      <GalleryGrid state="loading" items={[]} category={undefined} onReset={() => {}} onRetry={() => {}} onQuickPreview={() => {}} />,
    );
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('error state shows a retry affordance', () => {
    const onRetry = vi.fn();
    render(
      <GalleryGrid state="error" items={[]} category={undefined} onReset={() => {}} onRetry={onRetry} onQuickPreview={() => {}} />,
    );
    expect(screen.getByRole('alert')).toBeInTheDocument();
    screen.getByRole('button', { name: 'Réessayer' }).click();
    expect(onRetry).toHaveBeenCalled();
  });

  it('empty state shows a per-category message with a "Tout voir" reset', () => {
    const onReset = vi.fn();
    render(
      <GalleryGrid state="empty" items={[]} category="fanart" onReset={onReset} onRetry={() => {}} onQuickPreview={() => {}} />,
    );
    expect(screen.getByText('Aucune illustration dans cette catégorie.')).toBeInTheDocument();
    screen.getByRole('button', { name: 'Tout voir' }).click();
    expect(onReset).toHaveBeenCalled();
  });

  it('ready state renders one GalleryCard per item', () => {
    render(
      <GalleryGrid state="ready" items={items} category={undefined} onReset={() => {}} onRetry={() => {}} onQuickPreview={() => {}} />,
    );
    expect(screen.getByText('Lames de Brume — Ch.2')).toBeInTheDocument();
  });
});
