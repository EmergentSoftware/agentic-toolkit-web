import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSession } from '@/hooks/useSession';
import { SESSION_STORAGE_KEYS } from '@/lib/session';
import { SessionProvider } from '@/providers/SessionProvider';

import { apiErrorResponse, jsonResponse, stubFetch } from '../utils/api-stub';

const PRINCIPAL = { avatarUrl: null, login: 'tester', name: null, scheme: 'github' };

function Probe() {
  const session = useSession();
  return (
    <div>
      <span data-testid='status'>{session.status}</span>
      <span data-testid='user'>{session.user?.login ?? ''}</span>
      <span data-testid='has-api'>{session.api ? 'yes' : 'no'}</span>
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
  });

  afterEach(() => {
    window.sessionStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('is signed-out with no API client when no token is in sessionStorage', () => {
    const { calls } = stubFetch(() => jsonResponse(PRINCIPAL));
    render(wrap(<Probe />));
    expect(screen.getByTestId('status')).toHaveTextContent('signed-out');
    expect(screen.getByTestId('has-api')).toHaveTextContent('no');
    expect(calls).toHaveLength(0);
  });

  it('rehydrates the token from sessionStorage on mount and verifies membership via GET /me', async () => {
    window.sessionStorage.setItem(SESSION_STORAGE_KEYS.token, 'gho_rehydrated');
    const { calls } = stubFetch(() => jsonResponse(PRINCIPAL));

    render(wrap(<Probe />));

    // Starts in verifying while the query runs.
    expect(screen.getByTestId('status')).toHaveTextContent('verifying');

    // Resolves to member when /me succeeds (the API enforces org membership).
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('member'));
    expect(screen.getByTestId('user')).toHaveTextContent('tester');
    expect(screen.getByTestId('has-api')).toHaveTextContent('yes');

    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('http://localhost:7071/me');
    expect(calls[0]!.headers.get('authorization')).toBe('Bearer gho_rehydrated');
  });

  it('transitions to non-member on 403 not_org_member', async () => {
    window.sessionStorage.setItem(SESSION_STORAGE_KEYS.token, 'gho_nonmember');
    stubFetch(() => apiErrorResponse(403, 'not_org_member', 'Not an active member'));

    render(wrap(<Probe />));

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('non-member'));
    expect(window.sessionStorage.getItem(SESSION_STORAGE_KEYS.token)).toBe('gho_nonmember');
  });

  it('transitions to non-member on 403 org_membership_unverifiable and logs the SAML / OAuth-App hints', async () => {
    window.sessionStorage.setItem(SESSION_STORAGE_KEYS.token, 'gho_unverifiable');
    stubFetch(() => apiErrorResponse(403, 'org_membership_unverifiable', 'Could not verify membership'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    render(wrap(<Probe />));

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('non-member'));
    await waitFor(() => expect(warn).toHaveBeenCalled());
    const payload = JSON.stringify(warn.mock.calls[0]);
    expect(payload).toMatch(/policies\/applications/);
    expect(payload).toMatch(/SAML/);
  });

  it('returns to signed-out and clears the stored token on 401', async () => {
    window.sessionStorage.setItem(SESSION_STORAGE_KEYS.token, 'gho_expired');
    stubFetch(() => apiErrorResponse(401, 'unauthorized', 'Bad credentials'));

    render(wrap(<Probe />));

    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('signed-out'));
    expect(window.sessionStorage.getItem(SESSION_STORAGE_KEYS.token)).toBeNull();
    expect(screen.getByTestId('has-api')).toHaveTextContent('no');
  });

  it('signOut() clears the token and returns to signed-out', async () => {
    window.sessionStorage.setItem(SESSION_STORAGE_KEYS.token, 'gho_bye');
    stubFetch(() => jsonResponse(PRINCIPAL));

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
    await waitFor(() => expect(screen.getByTestId('sign-out').getAttribute('data-status')).toBe('member'));

    screen.getByTestId('sign-out').click();

    await waitFor(() => expect(screen.getByTestId('sign-out').getAttribute('data-status')).toBe('signed-out'));
    expect(window.sessionStorage.getItem(SESSION_STORAGE_KEYS.token)).toBeNull();
  });
});
