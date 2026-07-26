import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AccountSummary, GroupMemberDto, GroupMembersResponse } from '@encre-et-plume/shared';
import { SessionContext } from '../lib/session';

// The real App Router object is stable across renders — keep the mock stable too, otherwise the
// client's fetch effect (which depends on `router`) would re-run every render.
const router = { push: vi.fn(), replace: vi.fn() };
vi.mock('next/navigation', () => ({
  useParams: () => ({ slug: 'lames-de-brume' }),
  useRouter: () => router,
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode; [k: string]: unknown }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('../lib/api', () => ({
  getGroupMembers: vi.fn(),
  updateGroupMember: vi.fn(),
  revokeGroupMember: vi.fn(),
  updateRevenueSplit: vi.fn(),
  getMyProjects: vi.fn().mockResolvedValue({ items: [] }),
  getContacts: vi.fn().mockResolvedValue({ items: [] }),
  createInvitation: vi.fn(),
}));

import * as api from '../lib/api';
import GroupePermissionsClient from '../components/projet/GroupePermissionsClient';

const account: AccountSummary = {
  id: 'acc-me',
  displayName: 'Moi',
  email: 'moi@example.com',
  role: 'utilisateur',
  verified: false,
  slug: 'moi',
  avatar: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  preferences: { theme: 'system', dmPolicy: 'requests' },
  emailVerified: true,
  needsCguReconsent: false,
  onboarded: true,
  isAdult: true,
};

const owner: GroupMemberDto = {
  id: 'wc-owner',
  accountId: 'acc-me',
  name: 'Moi',
  slug: 'moi',
  avatar: null,
  creatorRole: 'scenariste',
  isOwner: true,
  groupRole: 'leader',
  permissions: ['ecriture', 'corrections'],
  effectivePermissions: ['ecriture', 'corrections', 'fusion'],
  sharePct: 60,
};

const yuki: GroupMemberDto = {
  id: 'wc-yuki',
  accountId: 'acc-yuki',
  name: 'Yuki Moreau',
  slug: 'yuki',
  avatar: null,
  creatorRole: 'dessinateur',
  isOwner: false,
  groupRole: 'member',
  permissions: ['ecriture', 'corrections'],
  effectivePermissions: ['ecriture', 'corrections'],
  sharePct: 40,
};

const group = (over: Partial<GroupMembersResponse> = {}): GroupMembersResponse => ({
  projectId: 'proj-1',
  projectTitle: 'Lames de brume',
  members: [owner, yuki],
  pending: [],
  viewer: { memberId: 'wc-owner', groupRole: 'leader', canManage: true, isLeader: true },
  splitTotal: 100,
  ...over,
});

function renderPage() {
  return render(
    <SessionContext.Provider value={{ account, loading: false, refresh: vi.fn(), logout: vi.fn() }}>
      <GroupePermissionsClient />
    </SessionContext.Provider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getGroupMembers).mockResolvedValue(group());
});

// T-WEB-1 — member rows, roles, permission switches
describe('GroupePermissionsClient — members card', () => {
  it('renders the prototype header and every member row with its role control', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: /Groupe & permissions/i })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Gérez les membres du projet, leur statut, la fusion (merge) des versions et le partage des revenus.',
      ),
    ).toBeInTheDocument();
    // Both cards (members + split) name each member — the viewer's own row reads "Vous".
    expect(screen.getAllByText('Vous')).toHaveLength(2);
    expect(screen.getAllByText('Yuki Moreau')).toHaveLength(2);
    // Manager sees a role selector per member (no native <select> — OnBrandSelect combobox).
    expect(screen.getByRole('combobox', { name: 'Statut de Yuki Moreau' })).toBeInTheDocument();
  });

  it('renders permission switches for a plain member and an implied static check icon for a leader row', async () => {
    renderPage();
    const ecriture = await screen.findByRole('switch', { name: 'Écriture — Yuki Moreau' });
    expect(ecriture).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('switch', { name: 'Fusion — Yuki Moreau' })).toHaveAttribute('aria-checked', 'false');
    // Leadership implies every permission → the owner row has no togglable switch.
    expect(screen.queryByRole('switch', { name: 'Écriture — Moi' })).not.toBeInTheDocument();
    // …it shows the icon instead (U-4: never the "✓" character).
    expect(screen.getAllByTestId('perm-yes').length).toBeGreaterThan(0);
    expect(screen.getAllByTestId('perm-yes')[0].querySelector('svg')).not.toBeNull();
  });

  it('toggles a permission through PATCH /members/:id and swaps in the response', async () => {
    const updated = group({ members: [owner, { ...yuki, permissions: ['ecriture', 'corrections', 'fusion'] }] });
    vi.mocked(api.updateGroupMember).mockResolvedValue(updated);
    renderPage();
    await userEvent.click(await screen.findByRole('switch', { name: 'Fusion — Yuki Moreau' }));
    await waitFor(() =>
      expect(api.updateGroupMember).toHaveBeenCalledWith('wc-yuki', {
        permissions: ['ecriture', 'corrections', 'fusion'],
      }),
    );
    await waitFor(() =>
      expect(screen.getByRole('switch', { name: 'Fusion — Yuki Moreau' })).toHaveAttribute('aria-checked', 'true'),
    );
  });

  it('a plain member sees the page read-only: no switches, no role selects, no revoke', async () => {
    vi.mocked(api.getGroupMembers).mockResolvedValue(
      group({ viewer: { memberId: 'wc-yuki', groupRole: 'member', canManage: false, isLeader: false } }),
    );
    renderPage();
    await screen.findAllByText('Yuki Moreau');
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Révoquer/ })).not.toBeInTheDocument();
    // …but still reads the roles and its own share ("votre part").
    expect(screen.getByText('Chef·fe de groupe')).toBeInTheDocument();
    expect(screen.getByText('Votre part')).toBeInTheDocument();
  });
});

// T-WEB-2 — revoke (DELETE) + role change
describe('GroupePermissionsClient — revoke & role', () => {
  it('revoking opens a confirmation dialog and only deletes on confirm', async () => {
    vi.mocked(api.revokeGroupMember).mockResolvedValue(group({ members: [{ ...owner, sharePct: 100 }] }));
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Révoquer Yuki Moreau' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Révoquer Yuki Moreau ?')).toBeInTheDocument();
    expect(api.revokeGroupMember).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Révoquer' }));
    await waitFor(() => expect(api.revokeGroupMember).toHaveBeenCalledWith('wc-yuki'));
    await waitFor(() => expect(screen.queryAllByText('Yuki Moreau')).toHaveLength(0));
  });

  it('the confirm button carries the destructive intent class', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Révoquer Yuki Moreau' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByRole('button', { name: 'Révoquer' })).toHaveClass('ep-btn-danger');
  });

  it('the owner row has no revoke button', async () => {
    renderPage();
    await screen.findAllByText('Yuki Moreau');
    expect(screen.queryByRole('button', { name: 'Révoquer Moi' })).not.toBeInTheDocument();
  });

  it('changing the group role calls PATCH /members/:id', async () => {
    vi.mocked(api.updateGroupMember).mockResolvedValue(group({ members: [owner, { ...yuki, groupRole: 'coleader' }] }));
    renderPage();
    await userEvent.click(await screen.findByRole('combobox', { name: 'Statut de Yuki Moreau' }));
    await userEvent.click(await screen.findByRole('option', { name: 'Co-chef·fe' }));
    await waitFor(() => expect(api.updateGroupMember).toHaveBeenCalledWith('wc-yuki', { groupRole: 'coleader' }));
  });

  it('renders the server error message when a mutation is rejected', async () => {
    vi.mocked(api.updateGroupMember).mockRejectedValue({
      statusCode: 400,
      message: 'Le groupe doit garder au moins un·e chef·fe de groupe.',
      error: 'Bad Request',
    });
    renderPage();
    await userEvent.click(await screen.findByRole('switch', { name: 'Fusion — Yuki Moreau' }));
    expect(await screen.findByText('Le groupe doit garder au moins un·e chef·fe de groupe.')).toBeInTheDocument();
  });
});

// T-WEB-3 — revenue split
describe('GroupePermissionsClient — revenue split', () => {
  it('updates the live total and blocks the save when it is not 100', async () => {
    renderPage();
    const input = await screen.findByLabelText('Part exacte de Yuki Moreau');
    await userEvent.clear(input);
    await userEvent.type(input, '30');
    expect(await screen.findByText('Le total des parts doit faire 100 %.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enregistrer la répartition' })).toBeDisabled();
    expect(screen.getByText('Total : 90 %')).toBeInTheDocument();
  });

  it('saves the full share set when the total is 100', async () => {
    vi.mocked(api.updateRevenueSplit).mockResolvedValue(
      group({ members: [{ ...owner, sharePct: 50 }, { ...yuki, sharePct: 50 }] }),
    );
    renderPage();
    const mine = await screen.findByLabelText('Votre part exacte');
    await userEvent.clear(mine);
    await userEvent.type(mine, '50');
    const other = screen.getByLabelText('Part exacte de Yuki Moreau');
    await userEvent.clear(other);
    await userEvent.type(other, '50');
    const save = screen.getByRole('button', { name: 'Enregistrer la répartition' });
    await waitFor(() => expect(save).toBeEnabled());
    await userEvent.click(save);
    await waitFor(() =>
      expect(api.updateRevenueSplit).toHaveBeenCalledWith('lames-de-brume', {
        shares: [
          { memberId: 'wc-owner', pct: 50 },
          { memberId: 'wc-yuki', pct: 50 },
        ],
      }),
    );
  });

  it('a non-manager reads the shares without any input', async () => {
    vi.mocked(api.getGroupMembers).mockResolvedValue(
      group({ viewer: { memberId: 'wc-yuki', groupRole: 'member', canManage: false, isLeader: false } }),
    );
    renderPage();
    await screen.findByText('Partage des revenus');
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Enregistrer la répartition' })).not.toBeInTheDocument();
  });
});

// T-WEB-4 — states + a11y
describe('GroupePermissionsClient — states & accessibility', () => {
  it('shows a loading status before the group resolves', () => {
    vi.mocked(api.getGroupMembers).mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('shows the empty-group hint when the owner is alone', async () => {
    vi.mocked(api.getGroupMembers).mockResolvedValue(
      group({ members: [{ ...owner, sharePct: 100 }] }),
    );
    renderPage();
    expect(
      await screen.findByText(
        "Vous êtes seul·e dans le groupe pour l'instant. Invitez un·e co-auteur·rice pour commencer.",
      ),
    ).toBeInTheDocument();
  });

  it('shows the error panel with a retry when the fetch fails', async () => {
    vi.mocked(api.getGroupMembers).mockRejectedValue({ statusCode: 404, message: 'Projet introuvable', error: 'Not Found' });
    renderPage();
    expect(await screen.findByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
  });

  it('announces the split total in a polite live region', async () => {
    renderPage();
    const total = await screen.findByText('Total : 100 %');
    expect(total.closest('[aria-live="polite"]')).not.toBeNull();
  });

  it('shows a pending invitee row without controls', async () => {
    vi.mocked(api.getGroupMembers).mockResolvedValue(
      group({ pending: [{ invitationId: 'inv-1', name: 'Léa Bonnet', avatar: null }] }),
    );
    renderPage();
    expect(await screen.findByText('Léa Bonnet')).toBeInTheDocument(); // pending rows exist only in the members card
    expect(screen.getByText('· En attente')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Révoquer Léa Bonnet' })).not.toBeInTheDocument();
  });
});

// ── Round 2 ────────────────────────────────────────────────────────────────────────────────────

// T-WEB-5 (U-2) — each share is adjustable with an on-brand native range slider.
describe('GroupePermissionsClient — revenue share slider', () => {
  it('exposes a labelled slider per member alongside the exact number entry', async () => {
    renderPage();
    expect(await screen.findByRole('slider', { name: 'Votre part' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Part de Yuki Moreau' })).toBeInTheDocument();
    expect(screen.getByLabelText('Votre part exacte')).toBeInTheDocument();
    expect(screen.getByLabelText('Part exacte de Yuki Moreau')).toBeInTheDocument();
  });

  it('moving the slider updates the readout and the live total', async () => {
    renderPage();
    const slider = (await screen.findByRole('slider', { name: 'Part de Yuki Moreau' })) as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '30' } });
    expect(screen.getByText('Total : 90 %')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enregistrer la répartition' })).toBeDisabled();
    expect(slider).toHaveValue('30');
  });

  it('slider and number input share one draft (editing either moves the other)', async () => {
    renderPage();
    const slider = (await screen.findByRole('slider', { name: 'Part de Yuki Moreau' })) as HTMLInputElement;
    const exact = screen.getByLabelText('Part exacte de Yuki Moreau') as HTMLInputElement;

    fireEvent.change(slider, { target: { value: '25' } });
    expect(exact).toHaveValue(25);

    await userEvent.clear(exact);
    await userEvent.type(exact, '40');
    expect(slider).toHaveValue('40');
  });

  it('saves the slider-driven values and disables the sliders while saving', async () => {
    let resolveSave: (v: GroupMembersResponse) => void = () => {};
    vi.mocked(api.updateRevenueSplit).mockReturnValue(
      new Promise<GroupMembersResponse>((res) => {
        resolveSave = res;
      }),
    );
    renderPage();
    const mine = (await screen.findByRole('slider', { name: 'Votre part' })) as HTMLInputElement;
    const other = screen.getByRole('slider', { name: 'Part de Yuki Moreau' }) as HTMLInputElement;
    fireEvent.change(mine, { target: { value: '70' } });
    fireEvent.change(other, { target: { value: '30' } });
    const save = screen.getByRole('button', { name: 'Enregistrer la répartition' });
    await waitFor(() => expect(save).toBeEnabled());
    await userEvent.click(save);
    await waitFor(() =>
      expect(api.updateRevenueSplit).toHaveBeenCalledWith('lames-de-brume', {
        shares: [
          { memberId: 'wc-owner', pct: 70 },
          { memberId: 'wc-yuki', pct: 30 },
        ],
      }),
    );
    expect(mine).toBeDisabled();
    resolveSave(group({ members: [{ ...owner, sharePct: 70 }, { ...yuki, sharePct: 30 }] }));
    await waitFor(() => expect(mine).toBeEnabled());
  });

  it('a non-manager gets the static bar, not a slider', async () => {
    vi.mocked(api.getGroupMembers).mockResolvedValue(
      group({ viewer: { memberId: 'wc-yuki', groupRole: 'member', canManage: false, isLeader: false } }),
    );
    renderPage();
    await screen.findByText('Partage des revenus');
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
  });
});

// T-WEB-6 (U-1 / U-3 / U-4) — shared danger scheme, one grid, zero check/cross characters.
describe('GroupePermissionsClient — house rules', () => {
  it('the per-row revoke uses the shared two-step danger scheme with an icon glyph', async () => {
    renderPage();
    const revoke = await screen.findByRole('button', { name: 'Révoquer Yuki Moreau' });
    expect(revoke).toHaveClass('ep-btn-danger-outline');
    expect(revoke.className).not.toMatch(/ep-group-revoke|ep-btn-compact/);
    expect(revoke.querySelector('svg')).not.toBeNull();
    expect(revoke.textContent).toBe('');
    // The red comes from the shared class ONLY — no local colour anywhere (CLAUDE.md button rule),
    // exactly like MC-7's "Retirer" trigger.
    expect(revoke.style.background).toBe('');
    expect(revoke.style.backgroundColor).toBe('');
    expect(revoke.style.color).toBe('');
    expect(revoke.style.borderColor).toBe('');
  });

  it('renders no check/cross character anywhere on the surface (U-4)', async () => {
    const { container } = renderPage();
    await screen.findAllByText('Yuki Moreau');
    expect(container.textContent ?? '').not.toMatch(/[✓✔✅✕✖❌✗]/);
  });

  it('the revoke confirmation is on the danger scheme too (no intent prop)', async () => {
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Révoquer Yuki Moreau' }));
    const dialog = await screen.findByRole('alertdialog');
    const confirm = within(dialog).getByRole('button', { name: 'Révoquer' });
    expect(confirm).toHaveClass('ep-btn-danger');
    expect(confirm.className).not.toMatch(/ep-btn-primary/);
    // Same idiom as MC-7's "Retirer" confirm / CallDetailModal's "Confirmer la suppression":
    // shared class for the fill, ink border + 2px hard shadow inline, no local colour.
    expect(confirm.style.background).toBe('');
    expect(confirm.style.backgroundColor).toBe('');
    expect(confirm.style.color).toBe('');
    expect(confirm.style.border).toBe('2px solid var(--ink)');
    expect(confirm.style.boxShadow).toBe('2px 2px 0 var(--shadow)');
    expect(document.body.textContent ?? '').not.toMatch(/[✓✔✅✕✖❌✗]/);
  });

  it('the column header and every member row share one grid template (U-3)', async () => {
    const { container } = renderPage();
    await screen.findAllByText('Yuki Moreau');
    const head = container.querySelector('.ep-group-head');
    const rows = container.querySelectorAll('.ep-group-row');
    expect(head).toHaveClass('ep-group-grid');
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach((r) => expect(r).toHaveClass('ep-group-grid'));
  });
});

// T-WEB-7 (N8) — an unrelated refresh must not discard in-progress percentage edits.
describe('GroupePermissionsClient — split draft persistence', () => {
  it('keeps an unsaved draft across a refresh that did not change the membership', async () => {
    // A permission toggle swaps the whole response object but the ids/shares are identical.
    vi.mocked(api.updateGroupMember).mockResolvedValue(
      group({ members: [owner, { ...yuki, permissions: ['ecriture', 'corrections', 'fusion'] }] }),
    );
    renderPage();
    const exact = (await screen.findByLabelText('Part exacte de Yuki Moreau')) as HTMLInputElement;
    await userEvent.clear(exact);
    await userEvent.type(exact, '35');
    await userEvent.click(screen.getByRole('switch', { name: 'Fusion — Yuki Moreau' }));
    await waitFor(() => expect(api.updateGroupMember).toHaveBeenCalled());
    expect(screen.getByLabelText('Part exacte de Yuki Moreau')).toHaveValue(35);
  });

  it('resets the draft when the server state actually changed the shares', async () => {
    vi.mocked(api.updateGroupMember).mockResolvedValue(
      group({ members: [{ ...owner, sharePct: 100 }, { ...yuki, sharePct: 0 }] }),
    );
    renderPage();
    const exact = (await screen.findByLabelText('Part exacte de Yuki Moreau')) as HTMLInputElement;
    await userEvent.clear(exact);
    await userEvent.type(exact, '35');
    await userEvent.click(screen.getByRole('switch', { name: 'Fusion — Yuki Moreau' }));
    await waitFor(() => expect(screen.getByLabelText('Part exacte de Yuki Moreau')).toHaveValue(0));
  });
});
