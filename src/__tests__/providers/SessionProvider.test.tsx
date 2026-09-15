import type { ReactNode } from 'react';

import { InteractionRequiredAuthError, ServerError } from '@azure/msal-browser';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSession } from '@/hooks/useSession';
import { createFakeEntraClient, type EntraClient, type FakeEntraClient } from '@/lib/entra';
import { SESSION_STORAGE_KEYS } from '@/lib/session';
import { SessionProvider } from '@/providers/SessionProvider';

import { apiErrorResponse, jsonResponse, stubFetch } from '../utils/api-stub';

const GITHUB_PRINCIPAL = { avatarUrl: null, id: '1', login: 'tester', name: null, scheme: 'github' };
const ENTRA_PRINCIPAL = {
  email: 'jasonp@emergentsoftware.net',
  id: 'oid-1',
  login: 'jasonp@emergentsoftware.net',
  name: 'Jason Paff',
  scheme: 'entra',
};
const ENTRA_ACCOUNT = { homeAccountId: 'home-1', name: 'Jason Paff', username: 'jasonp@emergentsoftware.net' };

function Probe() {
  const session = useSession();
  return (
    <div>
      <span data-testid='status'>{session.status}</span>
      <span data-testid='scheme'>{session.scheme ?? ''}</span>
      <span data-testid='user'>{session.user?.login ?? ''}</span>
      <span data-testid='has-api'>{session.api ? 'yes' : 'no'}</span>
      <span data-testid='notice-kind'>{session.notice?.kind ?? ''}</span>
      <span data-testid='notice-message'>{session.notice?.message ?? ''}</span>
      <button data-testid='sign-in-entra' onClick={() => session.signIn('entra', '/bundles')} type='button' />
      <button data-testid='sign-in-github' onClick={() => session.signIn('github')} type='button' />
      <button data-testid='sign-out' onClick={session.signOut} type='button' />
      <button data-testid='dismiss' onClick={session.dismissNotice} type='button' />
    </div>
  );
}

function renderProbe(entraClient: FakeEntraClient = createFakeEntraClient()) {
  render(wrap(<Probe />, entraClient));
  return entraClient;
}

function wrap(children: ReactNode, entraClient: EntraClient) {
  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: 0, retry: false, staleTime: Infinity } },
  });
  return (
    <QueryClientProvider client={client}>
      <SessionProvider entraClient={entraClient}>{children}</SessionProvider>
    </QueryClientProvider>
  );
}

const status = () => screen.getByTestId('status').textContent;

describe('SessionProvider', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.location.hash = '';
  });

  afterEach(() => {
    window.sessionStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('startup', () => {
    it('is verifying until MSAL has initialized, then signed-out with no API client and no requests', async () => {
      const { calls } = stubFetch(() => jsonResponse(GITHUB_PRINCIPAL));
      const entra = renderProbe();

      expect(status()).toBe('verifying');
      await waitFor(() => expect(status()).toBe('signed-out'));
      expect(screen.getByTestId('has-api')).toHaveTextContent('no');
      expect(screen.getByTestId('scheme')).toHaveTextContent('');
      expect(entra.calls.map((c) => c.method)).toEqual(['initialize', 'handleRedirect']);
      expect(calls).toHaveLength(0);
    });

    it('completes an Entra redirect return: the account becomes the session and /me runs with its token', async () => {
      const { calls } = stubFetch(() => jsonResponse(ENTRA_PRINCIPAL));
      renderProbe(createFakeEntraClient({ redirectResult: ENTRA_ACCOUNT, token: 'eyJ.entra.token' }));

      await waitFor(() => expect(status()).toBe('member'));
      expect(screen.getByTestId('scheme')).toHaveTextContent('entra');
      expect(screen.getByTestId('user')).toHaveTextContent('jasonp@emergentsoftware.net');
      expect(calls).toHaveLength(1);
      expect(calls[0]!.url).toBe('http://localhost:7071/me');
      expect(calls[0]!.headers.get('authorization')).toBe('Bearer eyJ.entra.token');
    });

    it('resumes an Entra session already cached in this tab (reload) and drops a leftover GitHub token', async () => {
      window.sessionStorage.setItem(SESSION_STORAGE_KEYS.token, 'gho_leftover');
      const { calls } = stubFetch(() => jsonResponse(ENTRA_PRINCIPAL));
      renderProbe(createFakeEntraClient({ account: ENTRA_ACCOUNT }));

      await waitFor(() => expect(status()).toBe('member'));
      expect(screen.getByTestId('scheme')).toHaveTextContent('entra');
      expect(window.sessionStorage.getItem(SESSION_STORAGE_KEYS.token)).toBeNull();
      expect(calls[0]!.headers.get('authorization')).toBe('Bearer entra-access-token');
    });

    it('shows a sign_in_failed notice and stays signed out when the redirect return fails', async () => {
      stubFetch(() => jsonResponse(ENTRA_PRINCIPAL));
      renderProbe(
        createFakeEntraClient({
          redirectError: new ServerError('access_denied', 'c', 'AADSTS65004: User declined to consent.'),
        }),
      );

      await waitFor(() => expect(status()).toBe('signed-out'));
      expect(screen.getByTestId('notice-kind')).toHaveTextContent('sign_in_failed');
      expect(screen.getByTestId('notice-message')).toHaveTextContent(/access_denied.*declined to consent/);

      screen.getByTestId('dismiss').click();
      await waitFor(() => expect(screen.getByTestId('notice-kind')).toHaveTextContent(''));
    });
  });

  describe('Entra session', () => {
    it('transitions to non-member on 403 guest_not_allowed', async () => {
      stubFetch(() => apiErrorResponse(403, 'guest_not_allowed', 'Guests are not allowed'));
      renderProbe(createFakeEntraClient({ account: ENTRA_ACCOUNT }));

      await waitFor(() => expect(status()).toBe('non-member'));
      expect(screen.getByTestId('scheme')).toHaveTextContent('entra');
    });

    it('ends the session with an entra_expired notice when the silent token request needs interaction', async () => {
      stubFetch(() => jsonResponse(ENTRA_PRINCIPAL));
      const entra = renderProbe(
        createFakeEntraClient({
          account: ENTRA_ACCOUNT,
          tokenError: new InteractionRequiredAuthError('login_required', 'c'),
        }),
      );

      await waitFor(() => expect(status()).toBe('signed-out'));
      expect(screen.getByTestId('notice-kind')).toHaveTextContent('entra_expired');
      expect(screen.getByTestId('notice-message')).toHaveTextContent(
        'Your Emergent sign-in has expired. Sign in again.',
      );
      expect(entra.calls.map((c) => c.method)).toContain('clearAccount');
      expect(screen.getByTestId('has-api')).toHaveTextContent('no');
    });

    it('signOut() hands off to the Entra logout redirect', async () => {
      stubFetch(() => jsonResponse(ENTRA_PRINCIPAL));
      const entra = renderProbe(createFakeEntraClient({ account: ENTRA_ACCOUNT }));
      await waitFor(() => expect(status()).toBe('member'));

      act(() => screen.getByTestId('sign-out').click());

      await waitFor(() => expect(status()).toBe('signed-out'));
      expect(entra.calls.map((c) => c.method)).toContain('logout');
    });

    it('signIn("entra") clears a GitHub session first and starts the redirect with the return path', async () => {
      window.sessionStorage.setItem(SESSION_STORAGE_KEYS.token, 'gho_current');
      window.sessionStorage.setItem(SESSION_STORAGE_KEYS.oauthState, '{"state":"s","returnPath":"/"}');
      stubFetch(() => jsonResponse(GITHUB_PRINCIPAL));
      const entra = renderProbe();
      await waitFor(() => expect(status()).toBe('member'));

      act(() => screen.getByTestId('sign-in-entra').click());

      await waitFor(() => expect(status()).toBe('authenticating'));
      expect(entra.calls).toContainEqual({ method: 'login', returnPath: '/bundles' });
      expect(window.sessionStorage.getItem(SESSION_STORAGE_KEYS.token)).toBeNull();
      expect(window.sessionStorage.getItem(SESSION_STORAGE_KEYS.oauthState)).toBeNull();
    });

    it('signIn("github") clears an Entra session before redirecting to GitHub', async () => {
      stubFetch(() => jsonResponse(ENTRA_PRINCIPAL));
      const assign = vi.fn();
      vi.stubGlobal('location', { ...window.location, assign, hash: '#/contribute' });
      const entra = renderProbe(createFakeEntraClient({ account: ENTRA_ACCOUNT }));
      await waitFor(() => expect(status()).toBe('member'));

      act(() => screen.getByTestId('sign-in-github').click());

      await waitFor(() => expect(status()).toBe('authenticating'));
      expect(entra.calls.map((c) => c.method)).toContain('clearAccount');
      expect(assign).toHaveBeenCalledWith(expect.stringMatching(/^https:\/\/github\.com\/login\/oauth\/authorize\?/));
      const stored = JSON.parse(window.sessionStorage.getItem(SESSION_STORAGE_KEYS.oauthState) ?? '{}') as {
        returnPath?: string;
      };
      expect(stored.returnPath).toBe('/contribute');
    });
  });

  describe('GitHub session (unchanged)', () => {
    it('rehydrates the token from sessionStorage on mount and verifies membership via GET /me', async () => {
      window.sessionStorage.setItem(SESSION_STORAGE_KEYS.token, 'gho_rehydrated');
      const { calls } = stubFetch(() => jsonResponse(GITHUB_PRINCIPAL));

      renderProbe();

      expect(status()).toBe('verifying');
      await waitFor(() => expect(status()).toBe('member'));
      expect(screen.getByTestId('scheme')).toHaveTextContent('github');
      expect(screen.getByTestId('user')).toHaveTextContent('tester');
      expect(screen.getByTestId('has-api')).toHaveTextContent('yes');

      expect(calls).toHaveLength(1);
      expect(calls[0]!.url).toBe('http://localhost:7071/me');
      expect(calls[0]!.headers.get('authorization')).toBe('Bearer gho_rehydrated');
    });

    it('transitions to non-member on 403 not_org_member', async () => {
      window.sessionStorage.setItem(SESSION_STORAGE_KEYS.token, 'gho_nonmember');
      stubFetch(() => apiErrorResponse(403, 'not_org_member', 'Not an active member'));

      renderProbe();

      await waitFor(() => expect(status()).toBe('non-member'));
      expect(window.sessionStorage.getItem(SESSION_STORAGE_KEYS.token)).toBe('gho_nonmember');
    });

    it('transitions to non-member on 403 org_membership_unverifiable and logs the SAML / OAuth-App hints', async () => {
      window.sessionStorage.setItem(SESSION_STORAGE_KEYS.token, 'gho_unverifiable');
      stubFetch(() => apiErrorResponse(403, 'org_membership_unverifiable', 'Could not verify membership'));
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

      renderProbe();

      await waitFor(() => expect(status()).toBe('non-member'));
      await waitFor(() => expect(warn).toHaveBeenCalled());
      const payload = JSON.stringify(warn.mock.calls[0]);
      expect(payload).toMatch(/policies\/applications/);
      expect(payload).toMatch(/SAML/);
    });

    it('returns to signed-out and clears the stored token on 401, with no notice', async () => {
      window.sessionStorage.setItem(SESSION_STORAGE_KEYS.token, 'gho_expired');
      stubFetch(() => apiErrorResponse(401, 'invalid_token', 'Bad credentials'));

      renderProbe();

      await waitFor(() => expect(status()).toBe('signed-out'));
      expect(window.sessionStorage.getItem(SESSION_STORAGE_KEYS.token)).toBeNull();
      expect(screen.getByTestId('has-api')).toHaveTextContent('no');
      expect(screen.getByTestId('notice-kind')).toHaveTextContent('');
    });

    it('keeps the API message verbatim as the github_auth_retired notice on 401 github_auth_retired', async () => {
      window.sessionStorage.setItem(SESSION_STORAGE_KEYS.token, 'gho_retired');
      const message =
        'GitHub sign-in to ATK ended on 2026-09-14. Update the CLI (`npm install -g @detergent-software/atk@latest`) and run `atk login`, or sign in to the web app with your Emergent account.';
      stubFetch(() => apiErrorResponse(401, 'github_auth_retired', message));

      renderProbe();

      await waitFor(() => expect(status()).toBe('signed-out'));
      expect(window.sessionStorage.getItem(SESSION_STORAGE_KEYS.token)).toBeNull();
      expect(screen.getByTestId('notice-kind')).toHaveTextContent('github_auth_retired');
      expect(screen.getByTestId('notice-message')).toHaveTextContent(message);
    });

    it('signOut() clears the token and returns to signed-out without touching Entra', async () => {
      window.sessionStorage.setItem(SESSION_STORAGE_KEYS.token, 'gho_bye');
      stubFetch(() => jsonResponse(GITHUB_PRINCIPAL));
      const entra = renderProbe();
      await waitFor(() => expect(status()).toBe('member'));

      act(() => screen.getByTestId('sign-out').click());

      await waitFor(() => expect(status()).toBe('signed-out'));
      expect(window.sessionStorage.getItem(SESSION_STORAGE_KEYS.token)).toBeNull();
      expect(entra.calls.map((c) => c.method)).not.toContain('logout');
    });

    it('exposes githubAuthSunset from the principal on the user', async () => {
      window.sessionStorage.setItem(SESSION_STORAGE_KEYS.token, 'gho_sunset');
      stubFetch(() => jsonResponse({ ...GITHUB_PRINCIPAL, githubAuthSunset: '2027-01-31T00:00:00+00:00' }));

      function SunsetProbe() {
        const { user } = useSession();
        return <span data-testid='sunset'>{user?.githubAuthSunset ?? ''}</span>;
      }
      render(wrap(<SunsetProbe />, createFakeEntraClient()));

      await waitFor(() => expect(screen.getByTestId('sunset')).toHaveTextContent('2027-01-31T00:00:00+00:00'));
    });
  });
});
