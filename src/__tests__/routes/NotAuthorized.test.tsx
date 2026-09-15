import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { type SessionContextValue } from '@/providers/SessionProvider';
import { NotAuthorizedRoute } from '@/routes/NotAuthorized';

import { makeSessionValue, SessionHarness } from '../utils/session-harness';

function renderRoute(session: SessionContextValue) {
  return render(
    <SessionHarness session={session}>
      <NotAuthorizedRoute />
    </SessionHarness>,
  );
}

describe('NotAuthorizedRoute', () => {
  it('keeps the GitHub org copy for a GitHub session', () => {
    const signOut = vi.fn();
    renderRoute(
      makeSessionValue({
        scheme: 'github',
        signOut,
        status: 'non-member',
        user: { id: '1', login: 'octo', scheme: 'github' },
      }),
    );

    expect(
      screen.getByText(/Your GitHub account is not a member of the Emergent Software organization/),
    ).toBeInTheDocument();
    expect(screen.getByTestId('not-authorized-content')).toHaveTextContent('signed in as octo');
    expect(screen.getByTestId('not-authorized-content')).toHaveTextContent(/EmergentSoftware GitHub organization/);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('explains the guest refusal for an Entra session', () => {
    const signOut = vi.fn();
    renderRoute(
      makeSessionValue({
        scheme: 'entra',
        signOut,
        status: 'non-member',
        user: { id: 'oid', login: 'guest_outlook.com#EXT#@emergentsoftware.onmicrosoft.com', scheme: 'entra' },
      }),
    );

    expect(screen.getByText('Your account is a guest in the Emergent Software tenant.')).toBeInTheDocument();
    expect(screen.getByTestId('not-authorized-content')).toHaveTextContent(
      'ATK is available to Emergent Software staff; sign out and use your Emergent account, or sign in with GitHub.',
    );
    expect(screen.queryByText(/read:org/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
