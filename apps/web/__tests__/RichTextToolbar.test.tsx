import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RichTextToolbar from '../components/editor/richtext/RichTextToolbar';

// A minimal chainable TipTap editor stub — records the terminal command invoked.
function makeEditor(active: Record<string, boolean> = {}) {
  const calls: string[] = [];
  const chain: Record<string, (...a: unknown[]) => typeof chain> = {} as never;
  const method = (name: string) => () => {
    if (name !== 'focus' && name !== 'run') calls.push(name);
    return chain;
  };
  for (const name of [
    'focus', 'toggleBold', 'toggleItalic', 'toggleUnderline', 'toggleStrike',
    'toggleBulletList', 'toggleOrderedList', 'toggleBlockquote',
    'setTextAlign', 'setHeading', 'setParagraph',
    'setColor', 'unsetColor', 'toggleHighlight', 'unsetHighlight',
    'setLink', 'unsetLink', 'extendMarkRange', 'unsetAllMarks',
    'undo', 'redo', 'run',
  ]) {
    chain[name] = method(name);
  }
  const editor = {
    on: vi.fn(),
    off: vi.fn(),
    chain: () => chain,
    isActive: (name: unknown) => {
      if (typeof name === 'string') return !!active[name];
      const key = Object.entries(name as Record<string, unknown>)[0];
      return !!active[`${key[0]}:${key[1]}`];
    },
    _calls: calls,
  };
  return editor as never as import('@tiptap/react').Editor & { _calls: string[] };
}

describe('RichTextToolbar', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the full labelled control set', () => {
    render(<RichTextToolbar editor={makeEditor()} />);
    expect(screen.getByRole('toolbar', { name: 'Mise en forme' })).toBeInTheDocument();
    for (const name of [
      'Gras', 'Italique', 'Souligné', 'Barré',
      'Couleur du texte', 'Surligner', 'Alignement',
      'Liste à puces', 'Liste numérotée', 'Citation', 'Lien',
      'Effacer la mise en forme', 'Annuler', 'Rétablir',
    ]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('toggles inline marks', async () => {
    const editor = makeEditor();
    render(<RichTextToolbar editor={editor} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Gras' }));
    await user.click(screen.getByRole('button', { name: 'Italique' }));
    await user.click(screen.getByRole('button', { name: 'Souligné' }));
    await user.click(screen.getByRole('button', { name: 'Barré' }));
    await user.click(screen.getByRole('button', { name: 'Liste à puces' }));
    await user.click(screen.getByRole('button', { name: 'Liste numérotée' }));
    await user.click(screen.getByRole('button', { name: 'Citation' }));
    expect(editor._calls).toEqual([
      'toggleBold', 'toggleItalic', 'toggleUnderline', 'toggleStrike',
      'toggleBulletList', 'toggleOrderedList', 'toggleBlockquote',
    ]);
  });

  it('marks the active mark with aria-pressed', () => {
    render(<RichTextToolbar editor={makeEditor({ bold: true })} />);
    expect(screen.getByRole('button', { name: 'Gras' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Italique' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('applies text alignment from the Alignement menu', async () => {
    const editor = makeEditor();
    render(<RichTextToolbar editor={editor} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Alignement' }));
    await user.click(screen.getByRole('option', { name: 'Centre' }));
    expect(editor._calls).toContain('setTextAlign');
  });

  it('opens a keyboard-operable Style listbox with Paragraphe / Titre 1-3', async () => {
    const editor = makeEditor();
    render(<RichTextToolbar editor={editor} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Style ▾' }));
    expect(screen.getByRole('listbox', { name: 'Style de texte' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Paragraphe/ })).toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: 'Titre 1' }));
    expect(editor._calls).toContain('setHeading');
  });

  it('sets and clears a text colour from the Couleur menu', async () => {
    const editor = makeEditor();
    render(<RichTextToolbar editor={editor} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Couleur du texte' }));
    await user.click(screen.getByRole('button', { name: 'Couleur #e8261c' }));
    expect(editor._calls).toContain('setColor');
    await user.click(screen.getByRole('button', { name: 'Couleur du texte' }));
    await user.click(screen.getByRole('button', { name: 'Par défaut' }));
    expect(editor._calls).toContain('unsetColor');
  });

  it('inserts and removes a link', async () => {
    const editor = makeEditor();
    render(<RichTextToolbar editor={editor} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Lien' }));
    await user.type(screen.getByLabelText('Adresse du lien'), 'https://exemple.fr');
    await user.click(screen.getByRole('button', { name: 'Insérer' }));
    expect(editor._calls).toContain('setLink');
    await user.click(screen.getByRole('button', { name: 'Lien' }));
    await user.click(screen.getByRole('button', { name: 'Supprimer le lien' }));
    expect(editor._calls).toContain('unsetLink');
  });

  it('clears formatting with marks-only reset (never clearNodes)', async () => {
    const editor = makeEditor();
    render(<RichTextToolbar editor={editor} />);
    await userEvent.click(screen.getByRole('button', { name: 'Effacer la mise en forme' }));
    expect(editor._calls).toEqual(expect.arrayContaining(['unsetAllMarks', 'unsetColor', 'unsetHighlight', 'setParagraph']));
    expect(editor._calls).not.toContain('clearNodes');
  });

  it('runs Yjs-aware undo / redo', async () => {
    const editor = makeEditor();
    render(<RichTextToolbar editor={editor} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Annuler' }));
    await user.click(screen.getByRole('button', { name: 'Rétablir' }));
    expect(editor._calls).toEqual(expect.arrayContaining(['undo', 'redo']));
  });

  it('disables controls when disabled', () => {
    render(<RichTextToolbar editor={makeEditor()} disabled />);
    expect(screen.getByRole('button', { name: 'Gras' })).toBeDisabled();
  });
});
