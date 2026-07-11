import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CallCard } from '@encre-et-plume/shared';
import CallBoardCard from '../components/appels/CallBoardCard';

const base: CallCard = {
  id: 'call-1',
  heading: 'SCÉNARISTE CHERCHE DESSINATEUR·RICE',
  title: '« Lames de Brume »',
  tags: ['Seinen', 'Thriller', '~120 planches'],
  authorName: 'Camille R.',
  authorAvatar: null,
  closesInDays: 12,
  applicationCount: 0,
  direction: 'writerSeeksIllustrator',
  description: 'Un thriller urbain mélancolique.',
  sampleUrl: null,
  status: 'open',
  deadline: '2026-07-19T00:00:00.000Z',
  isOwner: false,
  hasApplied: false,
  myApplicationId: null,
  myApplicationStatus: null,
  viewerHasRole: true,
  seekingRoles: ['dessinateur'],
  seats: { dessinateur: 1 },
  acceptedByRole: {},
  remainingSeats: 1,
};

describe('CallBoardCard', () => {
  it('renders eyebrow, title, chips, description and author', () => {
    render(<CallBoardCard call={base} />);
    expect(screen.getByText('SCÉNARISTE CHERCHE DESSINATEUR·RICE')).toBeInTheDocument();
    expect(screen.getByText('« Lames de Brume »')).toBeInTheDocument();
    expect(screen.getByText('Thriller')).toBeInTheDocument();
    expect(screen.getByText('~120 planches')).toBeInTheDocument();
    expect(screen.getByText('Un thriller urbain mélancolique.')).toBeInTheDocument();
    expect(screen.getByText('Camille R.')).toBeInTheDocument();
  });

  it('shows the deadline countdown when the call closes', () => {
    render(<CallBoardCard call={base} />);
    expect(screen.getByText('Clôture dans 12 j')).toBeInTheDocument();
  });

  it('shows the applicant count when there is no deadline', () => {
    render(<CallBoardCard call={{ ...base, closesInDays: null, deadline: null, applicationCount: 5 }} />);
    expect(screen.getByText('5 candidatures')).toBeInTheDocument();
    expect(screen.queryByText(/Clôture dans/)).not.toBeInTheDocument();
  });

  // §8 remaining seats.
  it('shows pluralized remaining seats on an open call and none when closed', () => {
    const { rerender } = render(<CallBoardCard call={{ ...base, remainingSeats: 3 }} />);
    expect(screen.getByText('3 places restantes')).toBeInTheDocument();
    rerender(<CallBoardCard call={{ ...base, remainingSeats: 1 }} />);
    expect(screen.getByText('1 place restante')).toBeInTheDocument();
    rerender(<CallBoardCard call={{ ...base, remainingSeats: 0 }} />);
    expect(screen.queryByText(/place/)).not.toBeInTheDocument();
    rerender(<CallBoardCard call={{ ...base, status: 'closed', remainingSeats: 2 }} />);
    expect(screen.queryByText(/restante/)).not.toBeInTheDocument();
  });

  it('marks a closed call and hides Candidater', () => {
    render(<CallBoardCard call={{ ...base, status: 'closed' }} />);
    expect(screen.getByText('Clôturé')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Candidater' })).not.toBeInTheDocument();
  });

  it('hides Candidater on the viewer own call', () => {
    render(<CallBoardCard call={{ ...base, isOwner: true }} />);
    expect(screen.queryByRole('button', { name: 'Candidater' })).not.toBeInTheDocument();
  });

  it('renders a Candidater button that calls back on other open calls', async () => {
    const onCandidater = vi.fn();
    const { getByRole } = render(<CallBoardCard call={base} onCandidater={onCandidater} />);
    const btn = getByRole('button', { name: 'Candidater' });
    btn.click();
    expect(onCandidater).toHaveBeenCalledTimes(1);
  });

  it('shows "Candidature envoyée" and no Candidater when the viewer already applied', () => {
    render(<CallBoardCard call={{ ...base, hasApplied: true }} />);
    expect(screen.getByText('Candidature envoyée')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Candidater' })).not.toBeInTheDocument();
  });

  // MC-14: once decided, the pill carries the actual status instead of "Candidature envoyée".
  it('shows "✓ Acceptée" (not "Candidature envoyée") when the viewer application is accepted', () => {
    render(<CallBoardCard call={{ ...base, hasApplied: true, myApplicationStatus: 'accepted' }} />);
    expect(screen.getByText('✓ Acceptée')).toBeInTheDocument();
    expect(screen.queryByText('Candidature envoyée')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Candidater' })).not.toBeInTheDocument();
  });

  it('shows "✕ Refusée" and keeps the "Candidater" button hidden when rejected', () => {
    render(<CallBoardCard call={{ ...base, hasApplied: true, myApplicationStatus: 'rejected' }} />);
    expect(screen.getByText('✕ Refusée')).toBeInTheDocument();
    expect(screen.queryByText('Candidature envoyée')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Candidater' })).not.toBeInTheDocument();
  });

  it('keeps "Candidature envoyée" while the application is still pending', () => {
    render(<CallBoardCard call={{ ...base, hasApplied: true, myApplicationStatus: 'pending' }} />);
    expect(screen.getByText('Candidature envoyée')).toBeInTheDocument();
    expect(screen.queryByText(/Acceptée|Refusée/)).not.toBeInTheDocument();
  });

  // MC-14 QA regression: the realistic auto-close trigger IS the accepted applicant's own seat —
  // accepting the last seat closes the call in the SAME commit. showCandidater (`!closed && ...`)
  // gates the whole applied-pill slot, so the accepted applicant loses their "✓ Acceptée" pill the
  // instant their acceptance auto-closes the call. See qa-report.md defect #1.
  it('[QA] still shows "✓ Acceptée" when the call auto-closed on the viewer own accepted seat', () => {
    render(<CallBoardCard call={{ ...base, status: 'closed', hasApplied: true, myApplicationStatus: 'accepted' }} />);
    expect(screen.getByText('✓ Acceptée')).toBeInTheDocument();
  });

  it('offers an inline "Retirer" affordance that withdraws the viewer application', async () => {
    const onWithdraw = vi.fn();
    render(
      <CallBoardCard
        call={{ ...base, hasApplied: true, myApplicationId: 'app-7' }}
        onWithdraw={onWithdraw}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Retirer' }));
    // Inline confirm, no browser confirm().
    await user.click(screen.getByRole('button', { name: 'Confirmer le retrait' }));
    expect(onWithdraw).toHaveBeenCalledWith('app-7');
  });

  it('shows a dashed placeholder with an accessible label when there is no sample', () => {
    render(<CallBoardCard call={base} />);
    expect(screen.getByLabelText("Aucun visuel d'exemple")).toBeInTheDocument();
  });

  it('renders the sample image with an alt when present', () => {
    render(<CallBoardCard call={{ ...base, sampleUrl: 'https://cdn/x.jpg' }} />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', 'https://cdn/x.jpg');
    expect(img).toHaveAttribute('alt', expect.stringContaining('Lames de Brume'));
  });

  // MC-4X role gate.
  it('disables Candidater with an explanatory hint when the viewer lacks the sought role', () => {
    const onCandidater = vi.fn();
    render(<CallBoardCard call={{ ...base, viewerHasRole: false }} onCandidater={onCandidater} />);
    const btn = screen.getByRole('button', { name: 'Candidater' });
    expect(btn).toBeDisabled();
    const hint = screen.getByText('Cet appel recherche un·e dessinateur·rice.');
    expect(hint).toBeInTheDocument();
    expect(btn).toHaveAttribute('aria-describedby', hint.id);
    btn.click();
    expect(onCandidater).not.toHaveBeenCalled();
  });

  it('uses the scénariste hint when the call seeks a scénariste', () => {
    render(<CallBoardCard call={{ ...base, seekingRoles: ['scenariste'], viewerHasRole: false }} />);
    expect(screen.getByText('Cet appel recherche un·e scénariste.')).toBeInTheDocument();
  });

  it('lists both sought roles in the hint on a multi-role call', () => {
    render(<CallBoardCard call={{ ...base, seekingRoles: ['dessinateur', 'scenariste'], viewerHasRole: false }} />);
    expect(
      screen.getByText('Cet appel recherche un·e dessinateur·rice ou un·e scénariste.'),
    ).toBeInTheDocument();
  });

  it('keeps Candidater active when the viewer holds the sought role', () => {
    render(<CallBoardCard call={{ ...base, viewerHasRole: true }} onCandidater={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Candidater' })).toBeEnabled();
    expect(screen.queryByText(/Cet appel recherche/)).not.toBeInTheDocument();
  });

  // MC-4X "Voir le détail" — present on every card (open / closed / own).
  it('renders "Voir le détail" and fires the callback on open, closed and own cards', async () => {
    for (const over of [{}, { status: 'closed' as const }, { isOwner: true }]) {
      const onVoirDetail = vi.fn();
      const { unmount } = render(
        <CallBoardCard call={{ ...base, ...over }} onVoirDetail={onVoirDetail} />,
      );
      const btn = screen.getByRole('button', { name: /Voir le détail/ });
      btn.click();
      expect(onVoirDetail).toHaveBeenCalledTimes(1);
      unmount();
    }
  });
});
