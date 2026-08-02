import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OverflowMenu, { MenuItem } from '../components/OverflowMenu';

// R3-0/R3-2 (review REG-1): the popover is positioned with `position: fixed` coordinates, so BOTH
// axes must be clamped into the viewport for EVERY placement. The round-2 code clamped Y only on the
// 'left' branch, which painted the default 'below' menu off-screen for a trigger near the bottom edge
// (`mc13-comptoir-roster` MC13-E6/E7). jsdom does no layout, so the trigger rect and the menu height
// are stubbed — the assertions are about the arithmetic, which is the whole defect.

const WIDTH = 200;
const MENU_H = 180;

function setViewport(w: number, h: number) {
  vi.stubGlobal('innerWidth', w);
  vi.stubGlobal('innerHeight', h);
}

function rect(r: { top: number; left: number; width?: number; height?: number }): DOMRect {
  const width = r.width ?? 44;
  const height = r.height ?? 44;
  return {
    top: r.top,
    left: r.left,
    width,
    height,
    bottom: r.top + height,
    right: r.left + width,
    x: r.left,
    y: r.top,
    toJSON: () => ({}),
  } as DOMRect;
}

/** Renders the menu, pins the trigger where the test wants it, then opens it. */
async function openAt(
  triggerRect: DOMRect,
  placement?: 'below' | 'left' | 'right',
): Promise<HTMLElement> {
  render(
    <OverflowMenu label="Actions" width={WIDTH} placement={placement}>
      {(close) => (
        <>
          <MenuItem onClick={close}>Voir le profil</MenuItem>
          <MenuItem onClick={close}>Envoyer un message</MenuItem>
          <MenuItem onClick={close}>Bloquer</MenuItem>
        </>
      )}
    </OverflowMenu>,
  );
  const trigger = screen.getByRole('button', { name: 'Actions' });
  trigger.getBoundingClientRect = () => triggerRect;
  await userEvent.click(trigger);
  return screen.getByRole('menu');
}

const top = (menu: HTMLElement) => parseFloat(menu.style.top);
const left = (menu: HTMLElement) => parseFloat(menu.style.left);

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return this.getAttribute('role') === 'menu' ? MENU_H : 0;
    },
  });
});

afterEach(() => {
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetHeight;
  vi.unstubAllGlobals();
});

describe('OverflowMenu — vertical clamp on every placement (R3-0 / REG-1)', () => {
  it('keeps the DEFAULT "below" menu inside the viewport for a trigger near the bottom edge', async () => {
    setViewport(400, 800);
    const menu = await openAt(rect({ top: 740, left: 100 })); // bottom = 784, 16px of room left

    expect(top(menu)).toBeGreaterThanOrEqual(8);
    expect(top(menu) + MENU_H).toBeLessThanOrEqual(800);
  });

  it('keeps a "left" flyout inside the viewport for a trigger near the bottom edge', async () => {
    setViewport(1280, 800);
    const menu = await openAt(rect({ top: 750, left: 900 }), 'left');

    expect(top(menu)).toBeGreaterThanOrEqual(8);
    expect(top(menu) + MENU_H).toBeLessThanOrEqual(800);
  });

  it('shows EVERY item when the menu is taller than the room both below AND above (R3-2)', async () => {
    setViewport(375, 200); // menu (180) barely fits at all — clamping is the only way out
    const menu = await openAt(rect({ top: 150, left: 40 }));

    expect(top(menu)).toBeGreaterThanOrEqual(8);
    expect(top(menu) + MENU_H).toBeLessThanOrEqual(200);
  });

  it('flips above the trigger rather than covering it when there is room up there', async () => {
    setViewport(1280, 800);
    const t = rect({ top: 700, left: 600 });
    const menu = await openAt(t);

    expect(top(menu) + MENU_H).toBeLessThanOrEqual(t.top);
  });
});

describe('OverflowMenu — side placements (R3-1)', () => {
  it('opens to the RIGHT of the trigger with placement="right"', async () => {
    setViewport(1280, 800);
    const t = rect({ top: 300, left: 200 });
    const menu = await openAt(t, 'right');

    expect(left(menu)).toBeGreaterThanOrEqual(t.right);
    expect(left(menu) + WIDTH).toBeLessThanOrEqual(1280);
  });

  it('opens to the LEFT of the trigger with placement="left"', async () => {
    setViewport(1280, 800);
    const t = rect({ top: 300, left: 900 });
    const menu = await openAt(t, 'left');

    expect(left(menu) + WIDTH).toBeLessThanOrEqual(t.left);
  });

  it('falls back instead of overflowing when the chosen side does not fit', async () => {
    setViewport(375, 800);
    const t = rect({ top: 300, left: 320 }); // right edge 364 — no room for a 200px flyout
    const menu = await openAt(t, 'right');

    expect(left(menu)).toBeGreaterThanOrEqual(8);
    expect(left(menu) + WIDTH).toBeLessThanOrEqual(375);
  });

  it('defaults to "below" when no placement is given', async () => {
    setViewport(1280, 800);
    const t = rect({ top: 100, left: 600 });
    const menu = await openAt(t);

    expect(top(menu)).toBe(t.bottom + 6);
  });
});
