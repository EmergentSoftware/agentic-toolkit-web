import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSession } from '@/hooks/useSession';
import { SESSION_STORAGE_KEYS } from '@/lib/session';
import { SessionProvider } from '@/providers/SessionProvider';

// Control what each new Octokit() instance returns. Update per-test before render.
const octokitControl: {
  authenticated: () => Promise<unknown>;
  getMembership: () => Promise<unknown>;
} = {
  authenticated: async () => ({ data: { avatar_url: null, login: 'tester', name: null } }),
  getMembership: async () => ({ data: { role: 'member', state: 'active' } }),
};

vi.mock('@octokit/rest', () => ({
  Octokit: class {
    rest = {
      orgs: { getMembershipForAuthenticatedUser: () => octokitControl.getMembership() },
      repos: { getContent: async () => ({ data: '' }) },
      users: { getAuthenticated: () => octokitControl.authenticated() },
    };
  },
}));

function Probe() {
  const session = useSession();
  return (
    <div>
      <span data-testid='status'>{session.status}</span>
      <span data-testid='user'>{session.user?.login ?? ''}</span>
    </div>
  );
}

function wrap(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: 0, retry: false, staleTime: Infinity } },
  });
  return (
    <QueryClientProvider client={client}>
      <SessionProvider>{children}</SessionProvider>
    </QueryClientProvider>
  );
}

describe('SessionProvider', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    octokitControl.authenticated = async () => ({
      data: { avatar_url: null, login: 'tester', name: null },
    });
    octokitControl.getMembership = async () => ({ data: { role: 'member', state: 'active' } });
  });

  afterEach(() => {
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('is signed-out when no token is in sessionStorage', () => {
    render(wrap(<Probe />));
    expect(screen.getByTestId('status')).toHaveTextContent('signed-out');
  });

  it('rehydrates the token from sessionStorage on mount and verifies membership', async () => {
    window.sessionStorage.setItem(SESSION_STORAGE_KEYS.token, 'gho_rehydrated');

    render(wrap(<Probe />));

    // Starts in verifying while the query runs.
    expect(screen.getByTestId('status')).toHaveTextContent('verifying');

    // Resolves to member when checkMembershipForUser succeeds.
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('member'));
    expect(screen.getByTestId('user')).toHaveTextContent('tester');
  });

  it('transitions to non-member when the membership check 404s', async () => {
    window.sessionStorage.setItem(SESSION_STORAGE_KEYS.token, 'gho_nonmember');
    octokitControl.getMembership = async () => {
      const err = new Error('not a member') as Error & { status: number };
      err.status = 404;
      throw err;
    };

    render(wrap(<Probe />));

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('non-member'));
  });

  it('transitions to non-member when membership is pending (not yet active)', async () => {
    window.sessionStorage.setItem(SESSION_STORAGE_KEYS.token, 'gho_pending');
    octokitControl.getMembership = async () => ({ data: { role: 'member', state: 'pending' } });

    render(wrap(<Probe />));

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('non-member'));
  });

  it('signOut() clears the token and returns to signed-out', async () => {
    window.sessionStorage.setItem(SESSION_STORAGE_KEYS.token, 'gho_bye');

    function SignOutButton() {
      const { signOut, status } = useSession();
      return (
        <button data-status={status} data-testid='sign-out' onClick={signOut} type='button'>
          out
        </button>
      );
    }

    render(wrap(<SignOutButton />));

    // Wait for verify query to settle before signing out.
    await waitFor(() =>
      expect(screen.getByTestId('sign-out').getAttribute('data-status')).toBe('member'),
    );

    screen.getByTestId('sign-out').click();

    await waitFor(() =>
      expect(screen.getByTestId('sign-out').getAttribute('data-status')).toBe('signed-out'),
    );
    expect(window.sessionStorage.getItem(SESSION_STORAGE_KEYS.token)).toBeNull();
  });
});
