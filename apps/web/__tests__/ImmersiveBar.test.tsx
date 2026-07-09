// DR-12 (2026-07-10) — fullscreen immersive toolbar. Two fixes covered here:
//  1. the toolbar root sits ABOVE the Stage page-turn click zones (zIndex 5) so its controls
//     ("Quitter le plein écran", the ReaderNav prev/next) are actually clickable.
//  2. the ⇄ "Sens de lecture" switch is present in the toolbar (was topbar-only, hidden in fullscreen).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { FavoriteWorkDto, WorkChapterDto } from '@encre-et-plume/shared';

import ImmersiveBar from '../components/lecteur/ImmersiveBar';
import type { ReadingDirection } from '../components/lecteur/readingDirection';

const favorites: FavoriteWorkDto[] = [];
const chapters: WorkChapterDto[] = [];

function renderBar(direction: ReadingDirection, extra?: Partial<React.ComponentProps<typeof ImmersiveBar>>) {
  const onToggleDirection = vi.fn();
  const onExitFullscreen = vi.fn();
  render(
    <ImmersiveBar
      page={2}
      totalPages={6}
      step={1}
      direction={direction}
      onPrev={vi.fn()}
      onNext={vi.fn()}
      onSetPage={vi.fn()}
      favorites={favorites}
      signedIn={false}
      chapters={chapters}
      currentChapterNumber={1}
      onLoadChapter={vi.fn()}
      onOpenPaywall={vi.fn()}
      onToggleDirection={onToggleDirection}
      onExitFullscreen={onExitFullscreen}
      {...extra}
    />,
  );
  return { onToggleDirection, onExitFullscreen };
}

describe('ImmersiveBar (DR-12)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the "Quitter le plein écran" control', () => {
    renderBar('rtl');
    expect(screen.getByRole('button', { name: /Quitter le plein écran/ })).toBeInTheDocument();
  });

  it('renders the toolbar above the Stage page-turn zones (zIndex >= 10, zones are 5)', () => {
    renderBar('rtl');
    const toolbar = screen.getByRole('toolbar', { name: /plein écran/i });
    expect(Number(toolbar.style.zIndex)).toBeGreaterThanOrEqual(10);
  });

  it('renders the ⇄ direction switch; RTL announces "droite à gauche" and is pressed', () => {
    renderBar('rtl');
    const sw = screen.getByRole('button', { name: /Sens de lecture/ });
    expect(sw).toHaveAttribute('aria-pressed', 'true');
    expect(sw).toHaveAccessibleName(/droite à gauche/);
  });

  it('LTR announces "gauche à droite" and is not pressed', () => {
    renderBar('ltr');
    const sw = screen.getByRole('button', { name: /Sens de lecture/ });
    expect(sw).toHaveAttribute('aria-pressed', 'false');
    expect(sw).toHaveAccessibleName(/gauche à droite/);
  });

  it('toggles the direction on click', () => {
    const { onToggleDirection } = renderBar('ltr');
    fireEvent.click(screen.getByRole('button', { name: /Sens de lecture/ }));
    expect(onToggleDirection).toHaveBeenCalledTimes(1);
  });
});
