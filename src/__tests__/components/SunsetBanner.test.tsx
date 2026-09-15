import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SunsetBanner } from '@/components/layout/SunsetBanner';
import { SESSION_STORAGE_KEYS } from '@/lib/session';
import { type SessionContextValue } from '@/providers/SessionProvider';

import { makeSessionValue, SessionHarness } from '../utils/session-harness';

const SUNSET = '2027-01-31T00:00:00+00:00';

function githubSession(overrides: Partial<SessionContextValue> = {}) {
  return makeSessionValue({
    scheme: 'github',
    status: 'member',
    user: { githubAuthSunset: SUNSET, id: '1', login: 'octo', scheme: 'github' },
    ...overrides,
  });
}

function renderBanner(session: SessionContextValue) {
  return render(
    <SessionHarness session={session}>
      <SunsetBanner />
    </SessionHarness>,
  );
}

describe('SunsetBanner', () => {
  beforeEach(() => window.sessionStorage.clear());
  afterEach(() => window.sessionStorage.clear());

  it('shows the cutoff date and a Switch now button for a GitHub session with githubAuthSunset', () => {
    const signIn = vi.fn();
    renderBanner(githubSession({ signIn }));

    const banner = screen.getByTestId('sunset-banner');
    expect(banner).toHaveTextContent(
      'GitHub sign-in to ATK ends on 2027-01-31. Switch to your Emergent account before then.',
    );

    fireEvent.click(screen.getByTestId('sunset-switch'));
    expect(signIn).toHaveBeenCalledWith('entra');
  });

  it('is absent for a GitHub session without a sunset', () => {
    renderBanner(githubSession({ user: { id: '1', login: 'octo', scheme: 'github' } }));
    expect(screen.queryByTestId('sunset-banner')).not.toBeInTheDocument();
  });

  it('is never shown for an Entra session', () => {
    renderBanner(
      makeSessionValue({
        scheme: 'entra',
        status: 'member',
        user: { githubAuthSunset: SUNSET, id: 'oid', login: 'jasonp@emergentsoftware.net', scheme: 'entra' },
      }),
    );
    expect(screen.queryByTestId('sunset-banner')).not.toBeInTheDocument();
  });

  it('is absent when signed out', () => {
    renderBanner(makeSessionValue());
    expect(screen.queryByTestId('sunset-banner')).not.toBeInTheDocument();
  });

  it('dismiss hides it and persists for the tab', () => {
    const { unmount } = renderBanner(githubSession());
    fireEvent.click(screen.getByTestId('sunset-dismiss'));

    expect(screen.queryByTestId('sunset-banner')).not.toBeInTheDocument();
    expect(window.sessionStorage.getItem(SESSION_STORAGE_KEYS.sunsetDismissed)).toBe('1');

    unmount();
    renderBanner(githubSession());
    expect(screen.queryByTestId('sunset-banner')).not.toBeInTheDocument();
  });
});
