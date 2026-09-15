import { render, screen } from '@testing-library/react';
import { NuqsTestingAdapter } from 'nuqs/adapters/testing';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SESSION_STORAGE_KEYS } from '@/lib/session';
import { type SessionContextValue } from '@/providers/SessionProvider';
import { SignInRoute } from '@/routes/SignIn';

import { makeSessionValue, SessionHarness } from '../utils/session-harness';

function renderSignIn(path: string, session: SessionContextValue) {
  const search = path.includes('?') ? path.slice(path.indexOf('?')) : '';
  return render(
    <SessionHarness session={session}>
      <MemoryRouter initialEntries={[path]}>
        <NuqsTestingAdapter searchParams={search}>
          <Routes>
            <Route element={<SignInRoute />} path='/sign-in' />
            <Route element={<div data-testid='home'>home</div>} path='/' />
            <Route element={<div data-testid='not-authorized'>na</div>} path='/not-authorized' />
          </Routes>
        </NuqsTestingAdapter>
      </MemoryRouter>
    </SessionHarness>,
  );
}

describe('SignInRoute', () => {
  beforeEach(() => window.sessionStorage.clear());
  afterEach(() => window.sessionStorage.clear());

  it('starts an Entra sign-in by default, restoring the stashed return path', () => {
    window.sessionStorage.setItem(SESSION_STORAGE_KEYS.pendingReturn, '/bundles');
    const signIn = vi.fn();
    renderSignIn('/sign-in', makeSessionValue({ signIn }));

    expect(signIn).toHaveBeenCalledWith('entra', '/bundles');
    expect(screen.getByText(/Redirecting to Microsoft/)).toBeInTheDocument();
  });

  it('starts a GitHub sign-in with ?provider=github', () => {
    const signIn = vi.fn();
    renderSignIn('/sign-in?provider=github', makeSessionValue({ signIn }));

    expect(signIn).toHaveBeenCalledWith('github', undefined);
    expect(screen.getByText(/Redirecting to GitHub/)).toBeInTheDocument();
  });

  it('forwards members home and non-members to /not-authorized', () => {
    const signIn = vi.fn();
    const { unmount } = renderSignIn('/sign-in', makeSessionValue({ scheme: 'entra', signIn, status: 'member' }));
    expect(screen.getByTestId('home')).toBeInTheDocument();
    unmount();

    renderSignIn('/sign-in', makeSessionValue({ scheme: 'github', signIn, status: 'non-member' }));
    expect(screen.getByTestId('not-authorized')).toBeInTheDocument();
    expect(signIn).not.toHaveBeenCalled();
  });
});
