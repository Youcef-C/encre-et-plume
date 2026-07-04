import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import {
  SearchIcon,
  CheckIcon,
  BookIcon,
  ArrowUpIcon,
  CircleIcon,
  CircleDotIcon,
  XIcon,
  HeartIcon,
  EyeIcon,
  FlameIcon,
} from '../components/icons';

// DR-2 FE-1 — new catalog icons (no emojis anywhere in the UI).
describe('DR-2 catalog icons', () => {
  it.each([
    ['SearchIcon', SearchIcon],
    ['CheckIcon', CheckIcon],
    ['BookIcon', BookIcon],
    ['ArrowUpIcon', ArrowUpIcon],
    ['CircleIcon', CircleIcon],
    ['CircleDotIcon (existing, pairs with CircleIcon)', CircleDotIcon],
    ['XIcon (reused for removable chips)', XIcon],
    ['HeartIcon (reused for ♥ counts)', HeartIcon],
  ])('%s renders a hidden svg', (_name, Icon) => {
    const { container } = render(<Icon />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });
});

// DR-5 FE-2 — gallery "Galerie" icons (no-emoji rule: 🔥 -> FlameIcon, 👁 -> EyeIcon).
describe('DR-5 gallery icons', () => {
  it.each([
    ['EyeIcon', EyeIcon],
    ['FlameIcon', FlameIcon],
  ])('%s renders a hidden svg', (_name, Icon) => {
    const { container } = render(<Icon />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(svg).toHaveAttribute('aria-hidden', 'true');
  });
});
