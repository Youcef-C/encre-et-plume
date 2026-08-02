import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen, waitFor, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AccountSummary, MessageDto, ProjectChatPage, WorkspaceMember } from '@encre-et-plume/shared';
import { WS_EVENTS } from '@encre-et-plume/shared';
import { SessionContext } from '../lib/session';

// ── socket bus: the test fires realtime events through it (same idiom as SalonDock.test). ──
const handlers: Record<string, (p?: unknown) => void> = {};
const mockSocket = {
  on: (event: string, h: (p?: unknown) => void) => {
    handlers[event] = h;
  },
  off: (event: string) => {
    delete handlers[event];
  },
  emit: vi.fn(),
};
function fire(event: string, payload?: unknown) {
  return act(() => {
    handlers[event]?.(payload);
  });
}
vi.mock('../lib/messaging', () => ({ useMessaging: () => ({ socket: mockSocket }) }));

vi.mock('../lib/api', () => ({
  getProjectMessages: vi.fn(),
  sendProjectMessage: vi.fn(),
  deleteMessage: vi.fn(),
  getMediaSignedUrl: vi.fn(),
  requestUpload: vi.fn(),
  finalizeMedia: vi.fn(),
  getMedia: vi.fn(),
}));

import * as api from '../lib/api';
import DiscussionPanel from '../components/projet/DiscussionPanel';

const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

const account: AccountSummary = {
  id: 'acc-me',
  displayName: 'Camille R.',
  email: 'camille@example.com',
  role: 'utilisateur',
  verified: false,
  slug: 'camille-r',
  avatar: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  preferences: { theme: 'system', dmPolicy: 'requests' },
} as AccountSummary;

const MEMBERS: WorkspaceMember[] = [
  { accountId: 'acc-me', displayName: 'Camille', avatar: null, roles: ['scenariste'] },
  { accountId: 'acc-yuki', displayName: 'Yuki', avatar: null, roles: ['dessinateur'] },
];

function msg(over: Partial<MessageDto> = {}): MessageDto {
  return {
    id: 'm-1',
    conversationId: 'conv-1',
    senderId: 'acc-yuki',
    body: 'Le nemu de la planche 4 est prêt, je l’ai déposé dans Fichiers.',
    attachments: [],
    createdAt: '2026-08-01T09:30:00.000Z',
    readBy: [],
    ...over,
  };
}

/** The API answers NEWEST-FIRST; the panel renders oldest→newest. */
function page(items: MessageDto[], over: Partial<ProjectChatPage> = {}): ProjectChatPage {
  return { items, nextCursor: null, conversationId: 'conv-1', canPost: true, ...over };
}

function renderPanel(isMember = true) {
  return render(
    <SessionContext.Provider
      value={{ account, loading: false, refresh: vi.fn(), setAccount: vi.fn() } as never}
    >
      <DiscussionPanel slug="lames-de-brume" members={MEMBERS} isMember={isMember} />
    </SessionContext.Provider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const k of Object.keys(handlers)) delete handlers[k];
  mocked.getProjectMessages.mockResolvedValue(page([msg()]));
  mocked.getMediaSignedUrl.mockResolvedValue({ url: 'https://cdn.example/att.png', expiresIn: 300 });
});
afterEach(() => vi.unstubAllGlobals());

describe('DiscussionPanel — replica header (F1)', () => {
  it('renders the prototype header with the member line', async () => {
    renderPanel();
    expect(await screen.findByText('Discussion du projet')).toBeInTheDocument();
    // Prototype: "Camille ✒ · Yuki 🖌 · 2 membres" — the glyphs are icons per D-1.
    const line = screen.getByTestId('discussion-members');
    expect(line).toHaveTextContent('Camille');
    expect(line).toHaveTextContent('Yuki');
    expect(line).toHaveTextContent('2 membres');
  });
});

describe('DiscussionPanel — the log (F1/F2/F3/F7)', () => {
  it('renders the thread as a log region', async () => {
    renderPanel();
    const log = await screen.findByRole('log', { name: 'Messages du projet' });
    expect(log).toBeInTheDocument();
  });

  it('an incoming message carries its sender label and its time (D-2)', async () => {
    const { container } = renderPanel();
    expect(await screen.findByText(/Le nemu de la planche 4/)).toBeInTheDocument();
    const bubble = screen.getByTestId('message-m-1');
    expect(bubble).toHaveAttribute('data-mine', 'false');
    expect(within(bubble).getByText('Yuki')).toBeInTheDocument();
    expect(container.querySelector('time[dateTime="2026-08-01T09:30:00.000Z"]')).not.toBeNull();
  });

  it('my own message renders as an outgoing bubble with no sender label', async () => {
    mocked.getProjectMessages.mockResolvedValue(
      page([msg({ id: 'm-2', senderId: 'acc-me', body: 'Je relis le dialogue.' })]),
    );
    renderPanel();
    const bubble = await screen.findByTestId('message-m-2');
    expect(bubble).toHaveAttribute('data-mine', 'true');
    expect(within(bubble).queryByText('Yuki')).toBeNull();
  });

  it('an image attachment renders inline with the filename as alt AND as caption (F3)', async () => {
    mocked.getProjectMessages.mockResolvedValue(
      page([
        msg({
          id: 'm-3',
          body: '',
          attachments: [{ mediaId: 'md-1', name: 'nemu-planche4.png', kind: 'image' }],
        }),
      ]),
    );
    renderPanel();
    const img = await screen.findByRole('img', { name: 'nemu-planche4.png' });
    expect(img).toHaveAttribute('src', 'https://cdn.example/att.png');
    const bubble = screen.getByTestId('message-m-3');
    expect(within(bubble).getByText('nemu-planche4.png')).toBeInTheDocument();
  });

  it('a document attachment renders as a named link', async () => {
    mocked.getProjectMessages.mockResolvedValue(
      page([msg({ id: 'm-4', body: '', attachments: [{ mediaId: 'md-2', name: 'script.pdf', kind: 'document' }] })]),
    );
    renderPanel();
    expect(await screen.findByRole('link', { name: /script\.pdf/ })).toBeInTheDocument();
  });
});

describe('DiscussionPanel — states (F5)', () => {
  it('shows a loading state, then the thread', async () => {
    let resolvePage: (p: ProjectChatPage) => void = () => {};
    mocked.getProjectMessages.mockReturnValue(new Promise<ProjectChatPage>((r) => (resolvePage = r)));
    renderPanel();
    expect(screen.getByRole('status', { name: 'Chargement de la discussion' })).toBeInTheDocument();
    await act(async () => resolvePage(page([msg()])));
    expect(await screen.findByText(/Le nemu de la planche 4/)).toBeInTheDocument();
  });

  it('shows « Aucun message » on an empty thread', async () => {
    mocked.getProjectMessages.mockResolvedValue(page([]));
    renderPanel();
    expect(await screen.findByText('Aucun message')).toBeInTheDocument();
  });

  it('shows an error with a retry when history fails to load', async () => {
    mocked.getProjectMessages.mockRejectedValueOnce(new Error('boom'));
    renderPanel();
    expect(await screen.findByRole('alert')).toHaveTextContent('Impossible de charger la discussion.');
    mocked.getProjectMessages.mockResolvedValue(page([msg()]));
    await userEvent.click(screen.getByRole('button', { name: 'Réessayer' }));
    expect(await screen.findByText(/Le nemu de la planche 4/)).toBeInTheDocument();
  });
});

describe('DiscussionPanel — composer (F4/F6)', () => {
  it('« Envoyer » is disabled until there is text or an attachment', async () => {
    renderPanel();
    const send = await screen.findByRole('button', { name: 'Envoyer' });
    expect(send).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Écrire à l’équipe'), 'Parfait !');
    expect(send).not.toBeDisabled();
  });

  it('the attach control is labelled', async () => {
    renderPanel();
    expect(await screen.findByRole('button', { name: 'Joindre un fichier' })).toBeInTheDocument();
  });

  it('sends through POST /projects/:slug/messages and shows the bubble optimistically', async () => {
    let resolveSend: (m: MessageDto) => void = () => {};
    mocked.sendProjectMessage.mockReturnValue(new Promise<MessageDto>((r) => (resolveSend = r)));
    renderPanel();
    await screen.findByText(/Le nemu de la planche 4/);

    await userEvent.type(screen.getByLabelText('Écrire à l’équipe'), 'Parfait !');
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer' }));

    // Optimistic: on screen before the server answers.
    expect(await screen.findByText('Parfait !')).toBeInTheDocument();
    expect(api.sendProjectMessage).toHaveBeenCalledWith('lames-de-brume', { text: 'Parfait !' });

    await act(async () =>
      resolveSend(msg({ id: 'srv-1', senderId: 'acc-me', body: 'Parfait !', createdAt: '2026-08-01T10:00:00.000Z' })),
    );
    // Reconciled to ONE bubble carrying the server id.
    expect(screen.getAllByText('Parfait !')).toHaveLength(1);
    expect(screen.getByTestId('message-srv-1')).toBeInTheDocument();
  });

  it('a failed send keeps the bubble and offers « Réessayer »', async () => {
    mocked.sendProjectMessage.mockRejectedValue({ message: 'Erreur réseau' });
    renderPanel();
    await screen.findByText(/Le nemu de la planche 4/);

    await userEvent.type(screen.getByLabelText('Écrire à l’équipe'), 'Parfait !');
    await userEvent.click(screen.getByRole('button', { name: 'Envoyer' }));

    expect(await screen.findByRole('button', { name: "Réessayer l'envoi" })).toBeInTheDocument();
    expect(screen.getByText('Parfait !')).toBeInTheDocument();

    mocked.sendProjectMessage.mockResolvedValue(msg({ id: 'srv-2', senderId: 'acc-me', body: 'Parfait !' }));
    await userEvent.click(screen.getByRole('button', { name: "Réessayer l'envoi" }));
    await waitFor(() => expect(screen.getByTestId('message-srv-2')).toBeInTheDocument());
  });
});

describe('DiscussionPanel — attachments (F5/F6)', () => {
  function stubXhr() {
    class FakeXhr {
      status = 200;
      upload = { onprogress: null as ((e: ProgressEvent) => void) | null };
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      open() {}
      setRequestHeader() {}
      send() {
        this.upload.onprogress?.({ lengthComputable: true, loaded: 5, total: 10 } as ProgressEvent);
        this.onload?.();
      }
    }
    vi.stubGlobal('XMLHttpRequest', FakeXhr);
  }

  // fireEvent, not userEvent.upload: the input is display:none (the visible control is the « ＋ »
  // button) and userEvent also filters files against `accept`, which would silently drop the
  // rejected-type case this suite is asserting on.
  function pick(file: File) {
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    return fireEvent.change(input, { target: { files: [file] } });
  }

  it('uploads a picked file as a private attachment, shows progress, then sends its mediaId', async () => {
    stubXhr();
    mocked.requestUpload.mockResolvedValue({ mediaId: 'md-9', uploadUrl: 'https://storage/put', bucketKey: 'k', expiresIn: 60 });
    // Hold `finalize` open so the in-flight state is observable (the PUT itself is instant here).
    let finish: (m: { id: string; status: string }) => void = () => {};
    mocked.finalizeMedia.mockReturnValue(new Promise((r) => (finish = r)));
    mocked.sendProjectMessage.mockResolvedValue(
      msg({ id: 'srv-9', senderId: 'acc-me', body: '', attachments: [{ mediaId: 'md-9', name: 'planche.png', kind: 'image' }] }),
    );
    renderPanel();
    await screen.findByText(/Le nemu de la planche 4/);

    pick(new File(['x'], 'planche.png', { type: 'image/png' }));
    // Progress is announced as a labelled control, not colour/shape alone.
    expect(await screen.findByLabelText('Téléversement de planche.png')).toHaveValue(50);
    await waitFor(() =>
      expect(api.requestUpload).toHaveBeenCalledWith(
        expect.objectContaining({ kind: 'attachment', visibility: 'private', contentType: 'image/png' }),
      ),
    );
    // Still uploading → sending is refused (a not-yet-ready mediaId would 400).
    expect(screen.getByRole('button', { name: 'Envoyer' })).toBeDisabled();
    await act(async () => finish({ id: 'md-9', status: 'ready' }));

    const send = screen.getByRole('button', { name: 'Envoyer' });
    await waitFor(() => expect(send).not.toBeDisabled());
    await userEvent.click(send);
    await waitFor(() =>
      expect(api.sendProjectMessage).toHaveBeenCalledWith('lames-de-brume', { attachments: [{ mediaId: 'md-9' }] }),
    );
  });

  it('refuses an unsupported file type inline, without uploading', async () => {
    renderPanel();
    await screen.findByText(/Le nemu de la planche 4/);
    pick(new File(['x'], 'virus.exe', { type: 'application/x-msdownload' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Format non pris en charge');
    expect(api.requestUpload).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Envoyer' })).toBeDisabled();
  });
});

describe('DiscussionPanel — realtime', () => {
  it('appends a message:new for THIS project conversation', async () => {
    renderPanel();
    await screen.findByText(/Le nemu de la planche 4/);
    await fire(WS_EVENTS.messageNew, {
      conversationId: 'conv-1',
      message: msg({ id: 'rt-1', body: 'On garde ce cadrage.' }),
      conversationName: 'Lames de brume',
      senderName: 'Yuki',
    });
    expect(await screen.findByText('On garde ce cadrage.')).toBeInTheDocument();
  });

  it("ignores another conversation's message:new", async () => {
    renderPanel();
    await screen.findByText(/Le nemu de la planche 4/);
    await fire(WS_EVENTS.messageNew, {
      conversationId: 'conv-other',
      message: msg({ id: 'rt-2', conversationId: 'conv-other', body: 'Message privé ailleurs.' }),
      conversationName: 'Autre',
      senderName: 'Léa',
    });
    expect(screen.queryByText('Message privé ailleurs.')).toBeNull();
  });
});

// R2-3 (review N-4): the per-bubble delete ICON is replaced by ONE discreet "…" menu on the LEFT of
// the bubble. The shell only — its single item is « Supprimer »; [[MC-15]] adds Répondre / Modifier /
// J'aime and rolls the same component out to the MC-9 widget and the MC-11 salon.
describe('DiscussionPanel — bubble actions menu (R2-3)', () => {
  const mine = () => page([msg({ id: 'mine-1', senderId: 'acc-me', body: 'À supprimer.' })]);
  const trigger = () => screen.findByRole('button', { name: /^Actions du message/ });

  it('replaces the delete icon with a "…" trigger named after its message', async () => {
    mocked.getProjectMessages.mockResolvedValue(mine());
    renderPanel();
    expect(await trigger()).toHaveAccessibleName('Actions du message « À supprimer. »');
    // The round-1 affordance is gone, not merely hidden.
    expect(screen.queryByRole('button', { name: 'Supprimer mon message' })).toBeNull();
  });

  it('opens from the KEYBOARD (hover is never the only path) and holds Supprimer only', async () => {
    mocked.getProjectMessages.mockResolvedValue(mine());
    renderPanel();
    const t = await trigger();
    t.focus();
    expect(t).toHaveFocus();
    await userEvent.keyboard('{Enter}');

    const menu = screen.getByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'Supprimer' })).toBeInTheDocument();
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(1);
  });

  // The log scrolls (`overflow-y: auto`) and the panel is a bordered box: an absolutely-positioned
  // popover is CLIPPED by them. The menu must escape its ancestors' overflow entirely.
  it('escapes the scrolling log’s overflow (top layer / fixed, never absolute)', async () => {
    mocked.getProjectMessages.mockResolvedValue(mine());
    renderPanel();
    await userEvent.click(await trigger());
    const menu = screen.getByRole('menu');
    expect(getComputedStyle(menu).position).toBe('fixed');
  });

  it('closes on Escape and gives focus back to the trigger', async () => {
    mocked.getProjectMessages.mockResolvedValue(mine());
    renderPanel();
    const t = await trigger();
    await userEvent.click(t);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    expect(t).toHaveFocus();
  });

  it('offers no actions menu on someone else’s message (delete is author-only)', async () => {
    renderPanel();
    await screen.findByText(/Le nemu de la planche 4/);
    expect(screen.queryByRole('button', { name: /^Actions du message/ })).toBeNull();
  });

  // R3-1/R3-2 — an outgoing (right-aligned) bubble points its menu LEFT, toward the middle of the
  // thread; and the LAST message of a thread sits at the bottom edge, where the menu must still show
  // every item. jsdom does no layout, so the trigger rect is pinned where the browser would put it.
  describe('placement (R3-1/R3-2)', () => {
    const MENU_H = 120;
    function pinTrigger(t: HTMLElement, r: { top: number; left: number }) {
      t.getBoundingClientRect = () =>
        ({
          top: r.top,
          left: r.left,
          width: 34,
          height: 44,
          bottom: r.top + 44,
          right: r.left + 34,
          x: r.left,
          y: r.top,
          toJSON: () => ({}),
        }) as DOMRect;
    }
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
    });

    it('opens the outgoing bubble’s menu to the LEFT of its trigger', async () => {
      vi.stubGlobal('innerWidth', 1280);
      vi.stubGlobal('innerHeight', 800);
      mocked.getProjectMessages.mockResolvedValue(mine());
      renderPanel();
      const t = await trigger();
      pinTrigger(t, { top: 300, left: 800 });
      await userEvent.click(t);

      const menu = screen.getByRole('menu');
      expect(parseFloat(menu.style.left) + 150).toBeLessThanOrEqual(800);
    });

    it('keeps every item on screen for the LAST message at 375px, where the flyout cannot fit', async () => {
      vi.stubGlobal('innerWidth', 375);
      vi.stubGlobal('innerHeight', 800);
      mocked.getProjectMessages.mockResolvedValue(mine());
      renderPanel();
      const t = await trigger();
      pinTrigger(t, { top: 740, left: 16 }); // bottom of the log, no room for a left flyout
      await userEvent.click(t);

      const menu = screen.getByRole('menu');
      expect(parseFloat(menu.style.top)).toBeGreaterThanOrEqual(8);
      expect(parseFloat(menu.style.top) + MENU_H).toBeLessThanOrEqual(800);
    });
  });
});

describe('DiscussionPanel — delete own message (D-3)', () => {
  async function openMenu() {
    await userEvent.click(await screen.findByRole('button', { name: /^Actions du message/ }));
    return userEvent.click(screen.getByRole('menuitem', { name: 'Supprimer' }));
  }

  it('asks for confirmation before deleting, then removes the bubble', async () => {
    mocked.getProjectMessages.mockResolvedValue(
      page([msg({ id: 'mine-1', senderId: 'acc-me', body: 'À supprimer.' })]),
    );
    mocked.deleteMessage.mockResolvedValue(undefined);
    renderPanel();

    await openMenu();
    expect(api.deleteMessage).not.toHaveBeenCalled();
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Supprimer le message');

    await userEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Supprimer' }));
    await waitFor(() => expect(api.deleteMessage).toHaveBeenCalledWith('mine-1'));
    await waitFor(() => expect(screen.queryByText('À supprimer.')).toBeNull());
  });

  it('restores the bubble when the delete fails', async () => {
    mocked.getProjectMessages.mockResolvedValue(
      page([msg({ id: 'mine-1', senderId: 'acc-me', body: 'À supprimer.' })]),
    );
    mocked.deleteMessage.mockRejectedValue(new Error('nope'));
    renderPanel();

    await openMenu();
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Supprimer' }));
    await waitFor(() => expect(api.deleteMessage).toHaveBeenCalled());
    expect(await screen.findByText('À supprimer.')).toBeInTheDocument();
  });
});

describe('DiscussionPanel — house rules', () => {
  it('renders no emoji and no literal check/cross glyph', async () => {
    const { container } = renderPanel();
    await screen.findByText(/Le nemu de la planche 4/);
    // ✒ 🖌 from the prototype are icons here (D-1); ✓/✕ are never typography (CLAUDE.md).
    expect(container.textContent ?? '').not.toMatch(/[✒🖌✓✔✅✕✖❌✗😀-🙏]/u);
  });
});

describe('DiscussionPanel — non-member (public project, read-only workspace)', () => {
  it('states the thread is members-only and fires no request', async () => {
    renderPanel(false);
    expect(await screen.findByText('La discussion est réservée aux membres du projet.')).toBeInTheDocument();
    expect(api.getProjectMessages).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Écrire à l’équipe')).toBeNull();
  });
});
