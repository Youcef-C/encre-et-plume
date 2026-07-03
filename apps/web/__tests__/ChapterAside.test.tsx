import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { WorkChapterDto } from '@encre-et-plume/shared';

import ChapterAside from '../components/lecteur/ChapterAside';

function chapter(n: number, overrides: Partial<WorkChapterDto> = {}): WorkChapterDto {
  return {
    id: `ch-${n}`,
    number: n,
    title: n === 1 ? 'Sous la pluie' : n === 2 ? 'La rencontre' : n === 3 ? 'Le pacte' : null,
    plancheCount: 6,
    publishedAt: '2024-03-14T00:00:00.000Z',
    likeCount: 100,
    locked: n >= 4,
    lockReason: n >= 4 ? 'premium' : null,
    ...overrides,
  };
}

const chapters = [chapter(1), chapter(2), chapter(3), chapter(4)];

describe('ChapterAside (DR-4 FE-3)', () => {
  const onLoadChapter = vi.fn();
  const onOpenPaywall = vi.fn();
  const onToggleCollapsed = vi.fn();

  beforeEach(() => vi.clearAllMocks());

  it('renders unlocked chapters with title, and locked chapters as "verrouillé ★"', () => {
    render(
      <ChapterAside
        chapters={chapters}
        currentChapterNumber={2}
        collapsed={false}
        onToggleCollapsed={onToggleCollapsed}
        onLoadChapter={onLoadChapter}
        onOpenPaywall={onOpenPaywall}
      />,
    );
    expect(screen.getByText('1 · Sous la pluie')).toBeInTheDocument();
    expect(screen.getByText('4 · — verrouillé ★')).toBeInTheDocument();
  });

  it('clicking an unlocked chapter calls onLoadChapter, not onOpenPaywall', () => {
    render(
      <ChapterAside
        chapters={chapters}
        currentChapterNumber={2}
        collapsed={false}
        onToggleCollapsed={onToggleCollapsed}
        onLoadChapter={onLoadChapter}
        onOpenPaywall={onOpenPaywall}
      />,
    );
    fireEvent.click(screen.getByText('1 · Sous la pluie'));
    expect(onLoadChapter).toHaveBeenCalledWith(chapters[0]);
    expect(onOpenPaywall).not.toHaveBeenCalled();
  });

  it('clicking a locked chapter calls onOpenPaywall, not onLoadChapter', () => {
    render(
      <ChapterAside
        chapters={chapters}
        currentChapterNumber={2}
        collapsed={false}
        onToggleCollapsed={onToggleCollapsed}
        onLoadChapter={onLoadChapter}
        onOpenPaywall={onOpenPaywall}
      />,
    );
    fireEvent.click(screen.getByText('4 · — verrouillé ★'));
    expect(onOpenPaywall).toHaveBeenCalledWith(chapters[3]);
    expect(onLoadChapter).not.toHaveBeenCalled();
  });

  it('collapsing hides the full chapter list and shows the mini rail', () => {
    render(
      <ChapterAside
        chapters={chapters}
        currentChapterNumber={2}
        collapsed={true}
        onToggleCollapsed={onToggleCollapsed}
        onLoadChapter={onLoadChapter}
        onOpenPaywall={onOpenPaywall}
      />,
    );
    expect(screen.queryByText('1 · Sous la pluie')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Développer' })).toBeInTheDocument();
  });

  it('the collapse toggle button fires onToggleCollapsed', () => {
    render(
      <ChapterAside
        chapters={chapters}
        currentChapterNumber={2}
        collapsed={false}
        onToggleCollapsed={onToggleCollapsed}
        onLoadChapter={onLoadChapter}
        onOpenPaywall={onOpenPaywall}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Réduire' }));
    expect(onToggleCollapsed).toHaveBeenCalledTimes(1);
  });
});
