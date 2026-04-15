import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';

import { DRY_RUN_PR_URL_MARKER } from '@/lib/publish-service';
import { ContributeSuccessRoute } from '@/routes/ContributeSuccess';

function renderAt(state: unknown, path = '/contribute/success') {
  return render(
    <MemoryRouter initialEntries={[{ pathname: path, state }]}>
      <Routes>
        <Route element={<ContributeSuccessRoute />} path='/contribute/success' />
        <Route element={<p data-testid='contribute-landing'>Contribute form</p>} path='/contribute' />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ContributeSuccessRoute', () => {
  it('renders the PR link and branch name from navigation state', () => {
    renderAt({
      branchName: 'asset/skill/my-skill/1.0.0',
      dryRun: false,
      prUrl: 'https://github.com/EmergentSoftware/agentic-toolkit-registry/pull/7',
    });

    const link = screen.getByTestId('contribute-success-pr-link') as HTMLAnchorElement;
    expect(link.href).toContain('/pull/7');
    expect(link.target).toBe('_blank');
    expect(screen.getByTestId('contribute-success-branch')).toHaveTextContent('asset/skill/my-skill/1.0.0');
    expect(screen.queryByTestId('contribute-success-dry-run')).not.toBeInTheDocument();
  });

  it('shows dry-run copy without a PR link when the marker URL is used', () => {
    renderAt({
      branchName: 'asset/skill/my-skill/1.0.0',
      dryRun: true,
      prUrl: DRY_RUN_PR_URL_MARKER,
    });

    expect(screen.getByTestId('contribute-success-dry-run')).toBeInTheDocument();
    expect(screen.queryByTestId('contribute-success-pr-link')).not.toBeInTheDocument();
  });

  it('redirects to /contribute when navigation state is absent', () => {
    renderAt(undefined);
    expect(screen.getByTestId('contribute-landing')).toBeInTheDocument();
  });

  it('renders a Contribute-another button that clears the draft', () => {
    window.sessionStorage.setItem('atk:contribute:draft', '{"name":"leftover"}');
    renderAt({ prUrl: 'https://example.com/pull/1' });
    const button = screen.getByTestId('contribute-success-another');
    expect(button).toBeInTheDocument();
  });
});
