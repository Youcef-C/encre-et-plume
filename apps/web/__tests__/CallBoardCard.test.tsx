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
});
