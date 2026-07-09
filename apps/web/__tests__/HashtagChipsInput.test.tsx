// DR-12 iter2 (FE-9 · V8) — freetext hashtag chips input. Space / Enter commit the current token
// through the shared normalizeHashtag (lowercased, '#'-stripped); duplicates ignored; cap 15;
// ✕ and Backspace-on-empty remove; paste splits on whitespace.
import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HASHTAGS_MAX_COUNT } from '@encre-et-plume/shared';
import HashtagChipsInput from '../components/form/HashtagChipsInput';

function Controlled({ initial = [], onChange }: { initial?: string[]; onChange?: (v: string[]) => void }) {
  const [value, setValue] = useState<string[]>(initial);
  return (
    <HashtagChipsInput
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange?.(v);
      }}
      ariaLabel="Hashtags"
    />
  );
}

describe('HashtagChipsInput (DR-12 iter2 FE-9)', () => {
  it('commits a normalized chip on space', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    await user.type(screen.getByLabelText('Hashtags'), '#Encre ');
    expect(onChange).toHaveBeenLastCalledWith(['encre']);
    expect(screen.getByText('#encre')).toBeInTheDocument();
  });

  it('commits on Enter and ignores duplicates', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    const input = screen.getByLabelText('Hashtags');
    await user.type(input, 'noir{Enter}');
    await user.type(input, 'noir{Enter}');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith(['noir']);
  });

  it('removes the last chip on Backspace when the input is empty', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled initial={['encre', 'noir']} onChange={onChange} />);
    await user.type(screen.getByLabelText('Hashtags'), '{Backspace}');
    expect(onChange).toHaveBeenLastCalledWith(['encre']);
  });

  it('removes a chip via its ✕ button', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled initial={['encre', 'noir']} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: 'Retirer #encre' }));
    expect(onChange).toHaveBeenLastCalledWith(['noir']);
  });

  it('splits a pasted whitespace-separated string into chips', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    const input = screen.getByLabelText('Hashtags');
    input.focus();
    await user.paste('tag1 tag2  #tag3');
    expect(onChange).toHaveBeenLastCalledWith(['tag1', 'tag2', 'tag3']);
  });

  it('caps at HASHTAGS_MAX_COUNT chips', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Controlled initial={Array.from({ length: HASHTAGS_MAX_COUNT }, (_, i) => `t${i}`)} onChange={onChange} />);
    await user.type(screen.getByLabelText('Hashtags'), 'overflow{Enter}');
    // no chip added past the cap
    expect(screen.queryByText('#overflow')).not.toBeInTheDocument();
  });
});
