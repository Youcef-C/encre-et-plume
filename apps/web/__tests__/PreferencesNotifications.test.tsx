import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PreferencesNotifications from '../components/PreferencesNotifications';
import { NOTIFICATION_TYPES } from '@encre-et-plume/shared';
import type { NotificationPreferencesResponse } from '@encre-et-plume/shared';

vi.mock('../lib/api', () => ({
  getNotificationPreferences: vi.fn(),
  updateNotificationPreferences: vi.fn(),
}));

import * as api from '../lib/api';

function makePreferences(overrides: Partial<Record<string, { inApp?: boolean; email?: boolean }>> = {}): NotificationPreferencesResponse {
  return {
    preferences: NOTIFICATION_TYPES.map((m) => ({
      type: m.type,
      group: m.group,
      mandatory: m.mandatory,
      inApp: overrides[m.type]?.inApp ?? m.defaultInApp,
      email: overrides[m.type]?.email ?? m.defaultEmail,
    })),
  };
}

describe('PreferencesNotifications — matrix rendering', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders one fieldset per NOTIFICATION_TYPES entry with FR group labels', async () => {
    vi.mocked(api.getNotificationPreferences).mockResolvedValue(makePreferences());
    render(<PreferencesNotifications />);

    await waitFor(() => {
      for (const meta of NOTIFICATION_TYPES) {
        expect(screen.getByRole('group', { name: meta.group })).toBeInTheDocument();
      }
    });
  });

  it('shows loading skeleton before data arrives', () => {
    vi.mocked(api.getNotificationPreferences).mockReturnValue(new Promise(() => {}));
    render(<PreferencesNotifications />);
    // Skeleton is present (aria-busy container or skeleton div)
    expect(document.querySelector('[aria-busy="true"]') ?? document.querySelector('.ep-skeleton-delayed')).toBeTruthy();
  });

  it('mandatory rows show "Toujours envoyé" and no interactive toggle', async () => {
    vi.mocked(api.getNotificationPreferences).mockResolvedValue(makePreferences());
    render(<PreferencesNotifications />);

    const mandatoryMeta = NOTIFICATION_TYPES.filter((m) => m.mandatory);
    await waitFor(() => {
      for (const meta of mandatoryMeta) {
        const fieldset = screen.getByRole('group', { name: meta.group });
        expect(within(fieldset).getByText(/toujours envoyé/i)).toBeInTheDocument();
        // No checkbox/switch inside a mandatory group
        expect(within(fieldset).queryByRole('switch')).toBeNull();
        expect(within(fieldset).queryByRole('checkbox')).toBeNull();
      }
    });
  });

  it('non-mandatory rows render labelled switches for Dans l\'app and E-mail', async () => {
    vi.mocked(api.getNotificationPreferences).mockResolvedValue(makePreferences());
    render(<PreferencesNotifications />);

    const nonMandatoryMeta = NOTIFICATION_TYPES.filter((m) => !m.mandatory);
    await waitFor(() => {
      for (const meta of nonMandatoryMeta) {
        const fieldset = screen.getByRole('group', { name: meta.group });
        // Expect two switches
        const switches = within(fieldset).getAllByRole('switch');
        expect(switches).toHaveLength(2);
      }
    });
  });

  it('switches have aria-checked matching row data', async () => {
    vi.mocked(api.getNotificationPreferences).mockResolvedValue(makePreferences({ messages: { inApp: false, email: true } }));
    render(<PreferencesNotifications />);

    await waitFor(() => {
      const messagesFieldset = screen.getByRole('group', { name: 'Messages' });
      const switches = within(messagesFieldset).getAllByRole('switch');
      // inApp = false, email = true
      const checked = switches.map((s) => s.getAttribute('aria-checked'));
      expect(checked).toContain('false');
      expect(checked).toContain('true');
    });
  });
});

describe('PreferencesNotifications — optimistic toggle', () => {
  beforeEach(() => vi.clearAllMocks());

  it('toggles immediately and calls updateNotificationPreferences', async () => {
    vi.mocked(api.getNotificationPreferences).mockResolvedValue(makePreferences({ messages: { inApp: true, email: true } }));
    vi.mocked(api.updateNotificationPreferences).mockResolvedValue(makePreferences({ messages: { inApp: false, email: true } }));

    const user = userEvent.setup();
    render(<PreferencesNotifications />);

    await waitFor(() => screen.getByRole('group', { name: 'Messages' }));
    const messagesFieldset = screen.getByRole('group', { name: 'Messages' });
    const switches = within(messagesFieldset).getAllByRole('switch');
    const inAppSwitch = switches.find((s) => s.getAttribute('aria-checked') === 'true');
    if (!inAppSwitch) throw new Error('No checked switch found');

    await user.click(inAppSwitch);
    expect(api.updateNotificationPreferences).toHaveBeenCalledOnce();
  });

  it('shows "Préférences enregistrées." toast on success', async () => {
    vi.mocked(api.getNotificationPreferences).mockResolvedValue(makePreferences());
    vi.mocked(api.updateNotificationPreferences).mockResolvedValue(makePreferences());

    const user = userEvent.setup();
    render(<PreferencesNotifications />);

    await waitFor(() => screen.getByRole('group', { name: 'Messages' }));
    const messagesFieldset = screen.getByRole('group', { name: 'Messages' });
    const switches = within(messagesFieldset).getAllByRole('switch');
    await user.click(switches[0]);

    // Text appears in both the hidden aria-live region and the visible toast; check at least one
    await waitFor(() => {
      expect(screen.queryAllByText(/préférences enregistrées/i).length).toBeGreaterThan(0);
    });
  });

  it('reverts toggle and shows error toast on API error', async () => {
    const initial = makePreferences({ messages: { inApp: true, email: true } });
    vi.mocked(api.getNotificationPreferences).mockResolvedValue(initial);
    vi.mocked(api.updateNotificationPreferences).mockRejectedValue({ message: 'Erreur serveur' });

    const user = userEvent.setup();
    render(<PreferencesNotifications />);

    await waitFor(() => screen.getByRole('group', { name: 'Messages' }));
    const messagesFieldset = screen.getByRole('group', { name: 'Messages' });
    const switches = within(messagesFieldset).getAllByRole('switch');
    // All start as checked (true)
    expect(switches[0]).toHaveAttribute('aria-checked', 'true');

    await user.click(switches[0]);

    // After error, reverts back to true
    await waitFor(() => {
      const updatedFieldset = screen.getByRole('group', { name: 'Messages' });
      const updatedSwitches = within(updatedFieldset).getAllByRole('switch');
      expect(updatedSwitches[0]).toHaveAttribute('aria-checked', 'true');
    });

    // Error notice present
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('has an aria-live status region for announcements', async () => {
    vi.mocked(api.getNotificationPreferences).mockResolvedValue(makePreferences());
    render(<PreferencesNotifications />);

    await waitFor(() => screen.getByRole('group', { name: 'Messages' }));
    // aria-live="polite" region exists
    const liveRegion = document.querySelector('[aria-live="polite"]');
    expect(liveRegion).toBeInTheDocument();
  });
});
