import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MessageReplyRef } from '@encre-et-plume/shared';

// R2-B: the likers list is fetched ON DEMAND — the message DTO never carries it.
vi.mock('../lib/api', () => ({ getMessageLikes: vi.fn() }));
import * as api from '../lib/api';

import MessageActions from '../components/messaging/MessageActions';
import MessageQuote from '../components/messaging/MessageQuote';
import MessageLikeToggle from '../components/messaging/MessageLikeToggle';
import MessageEditor from '../components/messaging/MessageEditor';

// MC-15 — the action layer is built ONCE and consumed by the MC-9 widget, the MC-11 salon dock and
// the CS-8 project Discussion. These tests are the contract those three surfaces share; a per-surface
// copy is exactly the drift this story exists to remove.

const TRIGGER = /^Actions du message/;

describe('MessageActions — the one "…" entry point (F1)', () => {
  it('offers Répondre, Modifier and Supprimer on my own message', async () => {
    render(
      <MessageActions
        authorName="Yuki"
        canEdit
        canDelete
        onReply={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: TRIGGER }));
    expect(screen.getByRole('menuitem', { name: 'Répondre' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Modifier' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Supprimer' })).toBeInTheDocument();
  });

  it("names its message's author, so a screen reader knows which bubble it acts on (F8)", () => {
    render(<MessageActions authorName="Yuki" canEdit={false} canDelete={false} onReply={vi.fn()} />);
    expect(screen.getByRole('button', { name: TRIGGER })).toHaveAccessibleName(
      'Actions du message de Yuki',
    );
  });

  // The salon passes canEdit={false} canDelete={false}; the component renders only what it is given
  // rather than special-casing a surface inside itself.
  it('SALON shape: canEdit=false + canDelete=false leaves Répondre alone', async () => {
    render(<MessageActions authorName="Yuki" canEdit={false} canDelete={false} onReply={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: TRIGGER }));
    expect(screen.getByRole('menuitem', { name: 'Répondre' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Modifier' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Supprimer' })).toBeNull();
  });

  it("someone else's message in a DM: Répondre only, no Modifier/Supprimer", async () => {
    render(<MessageActions authorName="Yuki" canEdit={false} canDelete={false} onReply={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: TRIGGER }));
    expect(screen.getAllByRole('menuitem')).toHaveLength(1);
  });

  it('opens from the KEYBOARD (D-1: hover is never the only path) and Escape returns focus', async () => {
    render(<MessageActions authorName="Yuki" canEdit canDelete onReply={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: TRIGGER });
    trigger.focus();
    await userEvent.keyboard('{Enter}');
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(trigger).toHaveFocus();
  });

  it('picking an item closes the menu and calls back', async () => {
    const onReply = vi.fn();
    render(<MessageActions authorName="Yuki" canEdit={false} canDelete={false} onReply={onReply} />);
    await userEvent.click(screen.getByRole('button', { name: TRIGGER }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Répondre' }));
    expect(onReply).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  // CS-8 round 3 N-6: an INCOMING bubble opens toward the middle of the thread, i.e. to the RIGHT.
  // MC-15 removed the `mine` gate on the trigger, which is what finally makes this case reachable.
  it('an incoming bubble asks the menu to open to the RIGHT of its trigger', async () => {
    render(<MessageActions authorName="Yuki" canEdit={false} canDelete={false} onReply={vi.fn()} placement="right" />);
    const trigger = screen.getByRole('button', { name: TRIGGER });
    trigger.getBoundingClientRect = () =>
      ({ top: 300, bottom: 344, left: 40, right: 74, width: 34, height: 44 }) as DOMRect;
    await userEvent.click(trigger);
    const menu = screen.getByRole('menu');
    // Glued to the trigger's RIGHT edge (74 + 6), never over the bubble it acts on.
    expect(menu.style.left).toBe('80px');
  });
});

describe('MessageQuote — the reply block (F2, D-3)', () => {
  const ref: MessageReplyRef = {
    id: 'm-1',
    senderId: 'acc-yuki',
    senderName: 'Yuki',
    excerpt: 'Le nemu de la planche 4 est prêt',
    deleted: false,
  };

  it('renders the quoted author and the server-truncated excerpt', () => {
    render(<MessageQuote reply={ref} />);
    expect(screen.getByText('Yuki')).toBeInTheDocument();
    expect(screen.getByText(/Le nemu de la planche 4 est prêt/)).toBeInTheDocument();
  });

  it('clicking the quote jumps to the original', async () => {
    const onJump = vi.fn();
    render(<MessageQuote reply={ref} onJump={onJump} />);
    await userEvent.click(screen.getByRole('button', { name: /Aller au message de Yuki/ }));
    expect(onJump).toHaveBeenCalledTimes(1);
  });

  // D-3: deleting one message must not silently rewrite someone else's.
  it('a deleted target reads « Message supprimé » and offers no jump', () => {
    render(
      <MessageQuote reply={{ id: '', senderId: '', senderName: '', excerpt: '', deleted: true }} onJump={vi.fn()} />,
    );
    expect(screen.getByText('Message supprimé')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('the composer banner names the target and can be cancelled', async () => {
    const onCancel = vi.fn();
    render(<MessageQuote reply={ref} variant="composer" onCancel={onCancel} />);
    expect(screen.getByText(/Réponse à/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Annuler la réponse' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});

describe('MessageLikeToggle — the heart (F5, D-2, D-5)', () => {
  const HEART = /^J’aime le message|^Je n’aime plus le message/;

  it('is a real toggle announcing its state, clickable on its own', async () => {
    const onToggle = vi.fn();
    render(<MessageLikeToggle messageId="m-1" liked={false} count={0} authorName="Yuki" onToggle={onToggle} />);
    const btn = screen.getByRole('button', { name: /J’aime le message de Yuki/ });
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(btn);
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it('a liked message toggles OFF on the next click', async () => {
    const onToggle = vi.fn();
    render(<MessageLikeToggle messageId="m-1" liked count={1} authorName="Yuki" onToggle={onToggle} />);
    const btn = screen.getByRole('button', { name: HEART });
    expect(btn).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(btn);
    expect(onToggle).toHaveBeenCalledWith(false);
  });

  // D-8 SUPERSEDES D-5 (round 2): the count is no longer decoration, it is the control that opens
  // « qui a aimé ». Hiding it at one like would make a single liker unknowable.
  it('D-8: the count shows from the FIRST like, because it is now the affordance', () => {
    const { rerender } = render(
      <MessageLikeToggle messageId="m-1" liked count={1} authorName="Yuki" onToggle={vi.fn()} />,
    );
    expect(screen.getByText('1')).toBeInTheDocument();
    rerender(<MessageLikeToggle messageId="m-1" liked count={3} authorName="Yuki" onToggle={vi.fn()} />);
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('no like, no count button at all', () => {
    render(<MessageLikeToggle messageId="m-1" liked={false} count={0} authorName="Yuki" onToggle={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Voir qui aime/ })).toBeNull();
  });

  it('announces the count, not colour alone', () => {
    render(<MessageLikeToggle messageId="m-1" liked count={3} authorName="Yuki" onToggle={vi.fn()} />);
    expect(screen.getByRole('button', { name: HEART })).toHaveAccessibleName(/3 j’aime/);
  });
});

// ─── R2-B · « voir qui a aimé » ────────────────────────────────────────────────
// The trap this solves: the heart is already a toggle (D-2). A control that both toggles AND opens a
// list on the same gesture is a trap, so the two are SEPARATE controls — heart = toggle, count = list.
describe('MessageLikers — who liked, on demand (R2-B)', () => {
  const LIKERS = /^Voir qui aime le message de Yuki/;
  const likers = (n = 2) => ({
    items: [
      { accountId: 'u-1', displayName: 'Yuki Moreau', avatar: null, createdAt: '2026-08-01T10:00:00.000Z' },
      { accountId: 'u-2', displayName: 'Sacha Benali', avatar: null, createdAt: '2026-08-01T09:00:00.000Z' },
    ].slice(0, n),
    nextCursor: null,
  });

  beforeEach(() => {
    vi.mocked(api.getMessageLikes).mockReset();
  });

  function renderToggle(onToggle = vi.fn()) {
    render(<MessageLikeToggle messageId="m-1" liked count={2} authorName="Yuki" onToggle={onToggle} />);
    return onToggle;
  }

  it('R2-B3: opening the list never toggles the like', async () => {
    vi.mocked(api.getMessageLikes).mockResolvedValue(likers());
    const onToggle = renderToggle();
    await userEvent.click(screen.getByRole('button', { name: LIKERS }));
    expect(await screen.findByRole('dialog', { name: 'Aimé par' })).toBeInTheDocument();
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('R2-B3: toggling the like never opens the list (and fetches nothing)', async () => {
    const onToggle = renderToggle();
    await userEvent.click(screen.getByRole('button', { name: /^Je n’aime plus le message/ }));
    expect(onToggle).toHaveBeenCalledWith(false);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(api.getMessageLikes).not.toHaveBeenCalled();
  });

  it('fetches on demand and lists the likers', async () => {
    vi.mocked(api.getMessageLikes).mockResolvedValue(likers());
    renderToggle();
    await userEvent.click(screen.getByRole('button', { name: LIKERS }));
    const panel = await screen.findByRole('dialog', { name: 'Aimé par' });
    expect(api.getMessageLikes).toHaveBeenCalledWith('m-1');
    expect(within(panel).getByText('Yuki Moreau')).toBeInTheDocument();
    expect(within(panel).getByText('Sacha Benali')).toBeInTheDocument();
  });

  it('shows a loading state while the list is in flight', async () => {
    vi.mocked(api.getMessageLikes).mockReturnValue(new Promise(() => {}));
    renderToggle();
    await userEvent.click(screen.getByRole('button', { name: LIKERS }));
    expect(await screen.findByText('Chargement…')).toBeInTheDocument();
  });

  it('an empty list says so instead of showing a blank box (everyone visible was blocked)', async () => {
    vi.mocked(api.getMessageLikes).mockResolvedValue({ items: [], nextCursor: null });
    renderToggle();
    await userEvent.click(screen.getByRole('button', { name: LIKERS }));
    expect(await screen.findByText('Personne pour le moment.')).toBeInTheDocument();
  });

  it('a failed fetch is reported and can be retried', async () => {
    vi.mocked(api.getMessageLikes).mockRejectedValueOnce(new Error('boom'));
    renderToggle();
    await userEvent.click(screen.getByRole('button', { name: LIKERS }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger la liste.');

    vi.mocked(api.getMessageLikes).mockResolvedValue(likers(1));
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText('Yuki Moreau')).toBeInTheDocument();
  });

  it('is keyboard operable: Escape closes it and focus returns to the count', async () => {
    vi.mocked(api.getMessageLikes).mockResolvedValue(likers());
    renderToggle();
    const trigger = screen.getByRole('button', { name: LIKERS });
    trigger.focus();
    await userEvent.keyboard('{Enter}');
    await screen.findByRole('dialog', { name: 'Aimé par' });
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(trigger).toHaveFocus();
  });
});

describe('MessageEditor — edit in place (F3, F6, F7)', () => {
  it('saves the new body', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(<MessageEditor initialValue="Bonjur" onSave={onSave} onCancel={vi.fn()} />);
    const field = screen.getByRole('textbox', { name: 'Modifier le message' });
    await userEvent.clear(field);
    await userEvent.type(field, 'Bonjour');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(onSave).toHaveBeenCalledWith('Bonjour');
  });

  it('refuses to save an empty body (same rule as a send)', async () => {
    const onSave = vi.fn();
    render(<MessageEditor initialValue="Bonjour" onSave={onSave} onCancel={vi.fn()} />);
    await userEvent.clear(screen.getByRole('textbox', { name: 'Modifier le message' }));
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(onSave).not.toHaveBeenCalled();
  });

  it('a failed edit restores the body and shows the server message', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('Vous ne pouvez modifier que vos propres messages.'));
    render(<MessageEditor initialValue="Bonjur" onSave={onSave} onCancel={vi.fn()} />);
    const field = screen.getByRole('textbox', { name: 'Modifier le message' });
    await userEvent.clear(field);
    await userEvent.type(field, 'Bonjour');
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Vous ne pouvez modifier que vos propres messages.',
    );
    expect(field).toHaveValue('Bonjur'); // the previous body is back
  });

  it('Escape and « Annuler » both abandon the edit', async () => {
    const onCancel = vi.fn();
    render(<MessageEditor initialValue="Bonjour" onSave={vi.fn()} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole('button', { name: 'Annuler' }));
    expect(onCancel).toHaveBeenCalledTimes(1);

    await userEvent.type(screen.getByRole('textbox', { name: 'Modifier le message' }), '{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});
