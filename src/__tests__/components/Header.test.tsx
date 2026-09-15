import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { Header } from '@/components/layout/Header';
import { ThemeProvider } from '@/components/theme/ThemeProvider';
import { type SessionContextValue } from '@/providers/SessionProvider';

import { makeSessionValue, SessionHarness } from '../utils/session-harness';

function renderHeader(session: SessionContextValue) {
  return render(
    <ThemeProvider>
      <SessionHarness session={session}>
        <MemoryRouter>
          <Header />
        </MemoryRouter>
      </SessionHarness>
    </ThemeProvider>,
  );
}

describe('Header', () => {
  it('starts an Entra sign-in from the Sign in button', () => {
    const signIn = vi.fn();
    renderHeader(makeSessionValue({ signIn }));

    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(signIn).toHaveBeenCalledWith('entra', undefined);
  });

  it('shows the Entra UPN and a Sign out button for an Entra session', () => {
    const signOut = vi.fn();
    renderHeader(
      makeSessionValue({
        scheme: 'entra',
        signOut,
        status: 'member',
        user: { id: 'oid', login: 'jasonp@emergentsoftware.net', name: 'Jason Paff', scheme: 'entra' },
      }),
    );

    expect(screen.getByTestId('user-login')).toHaveTextContent('jasonp@emergentsoftware.net');
    expect(screen.queryByRole('img', { name: /avatar/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('shows the GitHub login for a GitHub session', () => {
    renderHeader(
      makeSessionValue({
        scheme: 'github',
        status: 'member',
        user: { id: '1', login: 'octo', name: null, scheme: 'github' },
      }),
    );

    expect(screen.getByTestId('user-login')).toHaveTextContent('octo');
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });
});
