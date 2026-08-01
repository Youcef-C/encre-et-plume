// DR-12 (2026-07-10) — Reader page-turn click zones. Clicking the left/right half of the page area
// turns the page via the SAME direction-aware handlers the arrows/keys use (goNext/goPrev), which
// already carry the spread step (1 in single, 2 in double) — the zones never hardcode +1.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ChapterPagesResponse } from '@encre-et-plume/shared';

import Stage from '../components/lecteur/Stage';

function mangaPages(count: number): ChapterPagesResponse {
  return {
    workSlug: 'w',
    chapterNumber: 1,
    readMode: 'pages', hasCover: false,
    totalPages: count,
    pages: Array.from({ length: count }, (_, i) => ({ index: i + 1, image: null, caption: null, double: false })),
    prose: [],
  };
}

function renderStage(direction: 'ltr' | 'rtl', extra?: Partial<React.ComponentProps<typeof Stage>>) {
  const onPrev = vi.fn();
  const onNext = vi.fn();
  render(
    <Stage
      workTitle="Œuvre"
      chapterNumber={1}
      chapterTitle={null}
      pagesState="ready"
      pagesData={mangaPages(6)}
      page={3}
      spreadMode="single"
      direction={direction}
      onRetry={() => {}}
      onPrev={onPrev}
      onNext={onNext}
      {...extra}
    />,
  );
  return { onPrev, onNext };
}

describe('Stage page-turn click zones (DR-12)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('LTR: clicking the right side goes next, the left side goes previous', () => {
    const { onPrev, onNext } = renderStage('ltr');
    fireEvent.click(screen.getByTestId('page-turn-right'));
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onPrev).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('page-turn-left'));
    expect(onPrev).toHaveBeenCalledTimes(1);
  });

  it('RTL: clicking the left side goes next, the right side goes previous', () => {
    const { onPrev, onNext } = renderStage('rtl');
    fireEvent.click(screen.getByTestId('page-turn-left'));
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onPrev).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('page-turn-right'));
    expect(onPrev).toHaveBeenCalledTimes(1);
  });

  it('2-page (double) mode still routes through the SAME onNext handler (which steps by the spread)', () => {
    // The zones call onNext/onPrev verbatim — the spread step lives in goNext/goPrev, so a double
    // spread advances by 2 without the zones knowing anything about the step.
    const { onNext } = renderStage('ltr', { spreadMode: 'double', page: 1 });
    fireEvent.click(screen.getByTestId('page-turn-right'));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('the zones are inset from the bottom so they never cover the fullscreen toolbar strip', () => {
    renderStage('ltr');
    const left = screen.getByTestId('page-turn-left');
    // A non-zero bottom inset keeps the zones off the ImmersiveBar (which overlays the stage's
    // bottom edge in fullscreen), so its controls stay clickable.
    const bottom = left.style.bottom;
    expect(bottom).not.toBe('');
    expect(bottom).not.toBe('0px');
    expect(parseInt(bottom, 10)).toBeGreaterThan(0);
    // And the zones stay below the toolbar in the stacking order.
    expect(Number(left.style.zIndex)).toBeLessThan(10);
  });

  it('the zones are aria-hidden and not focusable (keyboard users have arrows + slider)', () => {
    renderStage('ltr');
    const left = screen.getByTestId('page-turn-left');
    expect(left).toHaveAttribute('aria-hidden', 'true');
    expect(left).not.toHaveAttribute('tabindex');
  });

  it('renders no click zones outside the ready state (loading placeholder)', () => {
    render(
      <Stage
        workTitle="Œuvre"
        chapterNumber={1}
        chapterTitle={null}
        pagesState="loading"
        pagesData={null}
        page={1}
        spreadMode="single"
        direction="ltr"
        onRetry={() => {}}
        onPrev={vi.fn()}
        onNext={vi.fn()}
      />,
    );
    expect(screen.queryByTestId('page-turn-left')).not.toBeInTheDocument();
    expect(screen.queryByTestId('page-turn-right')).not.toBeInTheDocument();
  });
});
