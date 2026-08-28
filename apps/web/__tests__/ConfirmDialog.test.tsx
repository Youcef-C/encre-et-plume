// CS-20 D-4 — the shared confirmation dialog now serves one POSITIVE confirm (the handoff offer)
// beside its destructive callers, so the confirm button's intent class is a prop with a `danger`
// default. Every pre-CS-20 call site passes nothing and stays red.
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ConfirmDialog from '../components/projet/ConfirmDialog';

const base = { title: 'Supprimer la carte ?', confirmLabel: 'Supprimer', onConfirm: vi.fn(), onCancel: vi.fn() };

describe('ConfirmDialog', () => {
  it('defaults the confirm button to the danger intent (destructive callers unchanged)', () => {
    render(<ConfirmDialog {...base} onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Supprimer' })).toHaveClass('ep-btn-danger');
  });

  it('renders a success-intent confirm when the action is positive', () => {
    render(
      <ConfirmDialog
        {...base}
        title="Le scénario a changé"
        confirmLabel="Créer une version puis passer en Nemu"
        confirmIntent="success"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const confirm = screen.getByRole('button', { name: 'Créer une version puis passer en Nemu' });
    expect(confirm).toHaveClass('ep-btn-success');
    expect(confirm).not.toHaveClass('ep-btn-danger');
  });

  it('still calls onConfirm / onCancel', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDialog {...base} confirmIntent="success" onConfirm={onConfirm} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    expect(onConfirm).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(onCancel).toHaveBeenCalled();
  });

  // CS-20 D-10 — the handoff offer is a THREE-way choice, and its primary is a navigation.
  it('renders the confirm as a link when confirmHref is given, and offers a secondary action', async () => {
    const onSecondary = vi.fn();
    render(
      <ConfirmDialog
        {...base}
        title="Scénario non enregistré"
        confirmLabel="Créer une version puis passer en Nemu"
        confirmIntent="success"
        confirmHref="/projet/nuit-blanche/editeur/pg7"
        secondaryLabel="Passer sans créer de version"
        onSecondary={onSecondary}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const link = screen.getByRole('link', { name: 'Créer une version puis passer en Nemu' });
    expect(link).toHaveAttribute('href', '/projet/nuit-blanche/editeur/pg7');
    expect(link).toHaveClass('ep-btn-success');
    await userEvent.click(screen.getByRole('button', { name: 'Passer sans créer de version' }));
    expect(onSecondary).toHaveBeenCalled();
  });
});
