import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SESSION_STORAGE_KEYS } from '@/lib/session';
import { AuthCallbackRoute } from '@/routes/AuthCallback';

import { makeSessionValue, SessionHarness } from '../utils/session-harness';

function renderCallback(search: string, sessionOverride = {}) {
  // Simulate the URL GitHub redirects to: query params in the real URL search,
  // fragment for the HashRouter path.
  const origin = window.location.origin;
  window.history.replaceState({}, '', `${origin}/${search}#/auth/callback`);

  const completeSignIn = vi.fn();
  const session = makeSessionValue({ completeSignIn, ...sessionOverride });
  const utils = render(
    <SessionHarness session={session}>
      <MemoryRouter initialEntries={['/auth/callback']}>
        <Routes>
          <Route element={<AuthCallbackRoute />} path='/auth/callback' />
          <Route element={<div data-testid='home'>home</div>} path='/' />
          <Route element={<div data-testid='post-auth'>post</div>} path='/bundles' />
        </Routes>
      </MemoryRouter>
    </SessionHarness>,
  );
  return { completeSignIn, ...utils };
}

describe('AuthCallbackRoute', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    window.history.replaceState({}, '', '/');
    vi.restoreAllMocks();
  });

  afterEach(() => {
    window.sessionStorage.clear();
    window.history.replaceState({}, '', '/');
    vi.restoreAllMocks();
  });

  it('shows an error when code/state are missing', () => {
    renderCallback('');
    expect(screen.getByTestId('auth-callback-error')).toHaveTextContent(/missing code or state/i);
  });

  it('rejects the callback when the stored state does not match', () => {
    window.sessionStorage.setItem(
      SESSION_STORAGE_KEYS.oauthState,
      JSON.stringify({ returnPath: '/', state: 'expected-state' }),
    );
    renderCallback('?code=abc&state=tampered');
    expect(screen.getByTestId('auth-callback-error')).toHaveTextContent(/state mismatch/i);
  });

  it('exchanges code for a token, stores it, and redirects to the stashed return path', async () => {
    window.sessionStorage.setItem(
      SESSION_STORAGE_KEYS.oauthState,
      JSON.stringify({ returnPath: '/bundles', state: 'abc-state' }),
    );
    const fetchMock = vi.fn(
      async (_input: Request | string | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ access_token: 'gho_test-token' }), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const { completeSignIn } = renderCallback('?code=abc&state=abc-state');

    await waitFor(() => expect(completeSignIn).toHaveBeenCalledWith('gho_test-token'));
    await waitFor(() => expect(screen.getByTestId('post-auth')).toBeInTheDocument());

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls[0];
    if (!call) throw new Error('fetch was not called');
    const request = call[0] as Request;
    expect(request.url).toBe('http://localhost:7071/auth/github/exchange');
    expect(request.method).toBe('POST');
    expect(request.headers.get('authorization')).toBeNull();
    await expect(request.clone().json()).resolves.toEqual({ code: 'abc' });
  });

  it('renders an error when the exchange call fails', async () => {
    window.sessionStorage.setItem(SESSION_STORAGE_KEYS.oauthState, JSON.stringify({ returnPath: '/', state: 'abc' }));
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('{"error":"bad_verification_code","message":"The code passed is incorrect or expired."}', {
            headers: { 'content-type': 'application/json' },
            status: 400,
          }),
      ),
    );

    renderCallback('?code=abc&state=abc');

    await waitFor(() =>
      expect(screen.getByTestId('auth-callback-error')).toHaveTextContent(/auth exchange failed \(HTTP 400\)/i),
    );
    expect(screen.getByTestId('auth-callback-error')).toHaveTextContent(/incorrect or expired/i);
  });
});
