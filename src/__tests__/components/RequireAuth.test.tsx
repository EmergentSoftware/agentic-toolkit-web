import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { RequireAuth } from '@/components/RequireAuth';
import { SESSION_STORAGE_KEYS } from '@/lib/session';

import { makeSessionValue, SessionHarness } from '../utils/session-harness';

function Landing() {
  return <div data-testid='landing'>landing</div>;
}

function NotAuthorized() {
  return <div data-testid='not-authorized'>not-authorized</div>;
}

function Protected() {
  return <div data-testid='protected-child'>protected!</div>;
}

function renderAt(path: string, session = makeSessionValue()) {
  return render(
    <SessionHarness session={session}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<Landing />} path='/' />
          <Route element={<NotAuthorized />} path='/not-authorized' />
          <Route
            element={
              <RequireAuth>
                <Protected />
              </RequireAuth>
            }
            path='/protected'
          />
        </Routes>
      </MemoryRouter>
    </SessionHarness>,
  );
}

describe('RequireAuth', () => {
  beforeEach(() => window.sessionStorage.clear());
  afterEach(() => window.sessionStorage.clear());

  it('renders children when the session status is "member"', () => {
    renderAt('/protected', makeSessionValue({ status: 'member', token: 'tok' }));
    expect(screen.getByTestId('protected-child')).toBeInTheDocument();
  });

  it('shows a loading screen while verifying', () => {
    renderAt('/protected', makeSessionValue({ status: 'verifying', token: 'tok' }));
    expect(screen.getByTestId('require-auth-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('protected-child')).not.toBeInTheDocument();
  });

  it('shows a loading screen while authenticating', () => {
    renderAt('/protected', makeSessionValue({ status: 'authenticating' }));
    expect(screen.getByTestId('require-auth-loading')).toBeInTheDocument();
  });

  it('redirects to / when signed-out and stashes the pending return path', () => {
    renderAt('/protected', makeSessionValue({ status: 'signed-out' }));
    expect(screen.getByTestId('landing')).toBeInTheDocument();
    expect(window.sessionStorage.getItem(SESSION_STORAGE_KEYS.pendingReturn)).toBe('/protected');
  });

  it('redirects non-members to /not-authorized', () => {
    renderAt('/protected', makeSessionValue({ status: 'non-member', token: 'tok' }));
    expect(screen.getByTestId('not-authorized')).toBeInTheDocument();
    expect(screen.queryByTestId('protected-child')).not.toBeInTheDocument();
  });
});
