import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OnBrandSelect from '../components/form/OnBrandSelect';

afterEach(() => vi.restoreAllMocks());

describe('OnBrandSelect', () => {
  it('renders a combobox trigger with the on-brand ink-border styling', () => {
    render(
      <OnBrandSelect aria-label="Trier" value="a" onChange={() => {}}>
        <option value="a">A</option>
        <option value="b">B</option>
      </OnBrandSelect>,
    );
    const trigger = screen.getByRole('combobox', { name: 'Trier' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'listbox');
    expect(trigger.style.fontWeight).toBe('700');
    expect(trigger.style.border).toBe('2px solid var(--ink)');
    expect(trigger).toHaveTextContent('A'); // shows the current value's label
  });

  it('opens the listbox and forwards the chosen value through onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <OnBrandSelect aria-label="Trier" value="a" onChange={onChange}>
        <option value="a">A</option>
        <option value="b">B</option>
      </OnBrandSelect>,
    );
    await user.click(screen.getByRole('combobox', { name: 'Trier' }));
    await user.click(screen.getByRole('option', { name: 'B' }));
    expect(onChange).toHaveBeenCalledWith({ target: { value: 'b' } });
  });

  it('closes on Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup();
    render(
      <OnBrandSelect aria-label="Trier" value="a" onChange={() => {}}>
        <option value="a">A</option>
        <option value="b">B</option>
      </OnBrandSelect>,
    );
    const trigger = screen.getByRole('combobox', { name: 'Trier' });
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{Escape}');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
  });

  // D1: Escape closing the OPEN popover must not bubble to a surrounding modal (which would close
  // it and discard edits); Escape when the popover is CLOSED must still bubble (to close a parent).
  it('does not propagate Escape to a parent while the popover is open, but does when closed', async () => {
    const user = userEvent.setup();
    const onParentEscape = vi.fn();
    render(
      <div
        onKeyDown={(e) => {
          if (e.key === 'Escape') onParentEscape();
        }}
      >
        <OnBrandSelect aria-label="Trier" value="a" onChange={() => {}}>
          <option value="a">A</option>
          <option value="b">B</option>
        </OnBrandSelect>
      </div>,
    );
    const trigger = screen.getByRole('combobox', { name: 'Trier' });

    // Open, then Escape: closes only the popover, parent never sees it.
    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{Escape}');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(onParentEscape).not.toHaveBeenCalled();

    // Closed, then Escape: bubbles to the parent (must still be able to close a modal).
    await user.keyboard('{Escape}');
    expect(onParentEscape).toHaveBeenCalledTimes(1);
  });

  it('is not searchable by default: opening shows no filter input', async () => {
    const user = userEvent.setup();
    render(
      <OnBrandSelect aria-label="Trier" value="a" onChange={() => {}}>
        <option value="a">Alpha</option>
        <option value="b">Bravo</option>
      </OnBrandSelect>,
    );
    await user.click(screen.getByRole('combobox', { name: 'Trier' }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  // ── U-5 (CS-10 round 2) ────────────────────────────────────────────────────────────────────
  // The popover used to be an `position:absolute` child of the trigger's wrapper, so ANY ancestor
  // with `overflow:hidden` (e.g. the CS-10 members card) clipped it — a z-index can never escape a
  // clipping ancestor — and `minWidth:100%` pinned it to a narrow table column, condensing the text.
  // 22 consumers carried the same latent bug, so the fix lives here, not at a call site.
  describe('popover is immune to clipping / stacking ancestors', () => {
    const RECT = {
      x: 120, y: 200, top: 200, left: 120, right: 220, bottom: 230, width: 100, height: 30,
      toJSON() {},
    } as DOMRect;

    function Clipped() {
      return (
        <div data-testid="clip" style={{ overflow: 'hidden', width: 100 }}>
          <OnBrandSelect aria-label="Statut" value="a" onChange={() => {}}>
            <option value="a">Chef·fe de groupe</option>
            <option value="b">Co-chef·fe</option>
          </OnBrandSelect>
        </div>
      );
    }

    it('renders the listbox outside an overflow:hidden ancestor (portalled to <body>)', async () => {
      const user = userEvent.setup();
      render(<Clipped />);
      await user.click(screen.getByRole('combobox', { name: 'Statut' }));
      const listbox = screen.getByRole('listbox');
      expect(screen.getByTestId('clip').contains(listbox)).toBe(false);
      expect(document.body.contains(listbox)).toBe(true);
    });

    it('positions the popover with position:fixed anchored to the trigger rect', async () => {
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(RECT);
      const user = userEvent.setup();
      render(<Clipped />);
      await user.click(screen.getByRole('combobox', { name: 'Statut' }));
      const popover = screen.getByRole('listbox').parentElement as HTMLElement;
      expect(popover.style.position).toBe('fixed');
      expect(popover.style.top).toBe('236px'); // trigger bottom (230) + 6px gap
      expect(popover.style.left).toBe('120px');
    });

    it('sizes to its content with the trigger width as a floor (no condensed option text)', async () => {
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(RECT);
      const user = userEvent.setup();
      render(<Clipped />);
      await user.click(screen.getByRole('combobox', { name: 'Statut' }));
      const popover = screen.getByRole('listbox').parentElement as HTMLElement;
      expect(popover.style.width).toBe('max-content');
      expect(popover.style.minWidth).toBe('100px');
      expect(popover.style.maxWidth).not.toBe(''); // capped so a long option can't overflow the viewport
    });

    it('still commits a click on an option rendered in the portal', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <div style={{ overflow: 'hidden' }}>
          <OnBrandSelect aria-label="Statut" value="a" onChange={onChange}>
            <option value="a">Chef·fe de groupe</option>
            <option value="b">Co-chef·fe</option>
          </OnBrandSelect>
        </div>,
      );
      await user.click(screen.getByRole('combobox', { name: 'Statut' }));
      await user.click(screen.getByRole('option', { name: 'Co-chef·fe' }));
      expect(onChange).toHaveBeenCalledWith({ target: { value: 'b' } });
    });

    it('still closes on an outside click', async () => {
      const user = userEvent.setup();
      render(
        <div>
          <button type="button">ailleurs</button>
          <Clipped />
        </div>,
      );
      const trigger = screen.getByRole('combobox', { name: 'Statut' });
      await user.click(trigger);
      expect(trigger).toHaveAttribute('aria-expanded', 'true');
      await user.click(screen.getByRole('button', { name: 'ailleurs' }));
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
    });
  });

  describe('searchable mode', () => {
    function Countries() {
      return (
        <OnBrandSelect
          aria-label="Pays"
          searchable
          searchPlaceholder="Rechercher un pays"
          value=""
          onChange={() => {}}
        >
          <option value="">—</option>
          <option value="FR">France</option>
          <option value="DE">Allemagne</option>
          <option value="JP">Japon</option>
        </OnBrandSelect>
      );
    }

    it('filters options by case-insensitive substring as you type', async () => {
      const user = userEvent.setup();
      render(<Countries />);
      await user.click(screen.getByRole('combobox', { name: 'Pays' }));
      const search = screen.getByRole('textbox', { name: 'Rechercher un pays' });
      expect(search).toHaveFocus();
      await user.type(search, 'jap');
      expect(screen.getByRole('option', { name: 'Japon' })).toBeInTheDocument();
      expect(screen.queryByRole('option', { name: 'France' })).not.toBeInTheDocument();
      expect(screen.queryByRole('option', { name: 'Allemagne' })).not.toBeInTheDocument();
    });

    it('selects a filtered option with ArrowDown + Enter', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(
        <OnBrandSelect aria-label="Pays" searchable searchPlaceholder="Rechercher un pays" value="" onChange={onChange}>
          <option value="">—</option>
          <option value="FR">France</option>
          <option value="DE">Allemagne</option>
          <option value="JP">Japon</option>
        </OnBrandSelect>,
      );
      await user.click(screen.getByRole('combobox', { name: 'Pays' }));
      await user.type(screen.getByRole('textbox', { name: 'Rechercher un pays' }), 'alle');
      await user.keyboard('{ArrowDown}{Enter}');
      expect(onChange).toHaveBeenCalledWith({ target: { value: 'DE' } });
    });

    it('shows "Aucun résultat" when nothing matches', async () => {
      const user = userEvent.setup();
      render(<Countries />);
      await user.click(screen.getByRole('combobox', { name: 'Pays' }));
      await user.type(screen.getByRole('textbox', { name: 'Rechercher un pays' }), 'zzz');
      expect(screen.getByText('Aucun résultat')).toBeInTheDocument();
      expect(screen.queryByRole('option')).not.toBeInTheDocument();
    });

    it('closes on Escape and resets the query on reopen', async () => {
      const user = userEvent.setup();
      render(<Countries />);
      const trigger = screen.getByRole('combobox', { name: 'Pays' });
      await user.click(trigger);
      await user.type(screen.getByRole('textbox', { name: 'Rechercher un pays' }), 'jap');
      await user.keyboard('{Escape}');
      expect(trigger).toHaveAttribute('aria-expanded', 'false');
      expect(trigger).toHaveFocus();
      await user.click(trigger);
      // query reset: the search box is empty and all options are back
      expect(screen.getByRole('textbox', { name: 'Rechercher un pays' })).toHaveValue('');
      expect(screen.getByRole('option', { name: 'France' })).toBeInTheDocument();
    });
  });
});
