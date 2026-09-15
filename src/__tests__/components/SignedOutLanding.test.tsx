import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SignedOutLanding } from '@/components/SignedOutLanding';
import { SESSION_STORAGE_KEYS } from '@/lib/session';

import { makeSessionValue, SessionHarness } from '../utils/session-harness';

describe('SignedOutLanding', () => {
  beforeEach(() => window.sessionStorage.clear());
  afterEach(() => window.sessionStorage.clear());

  it('offers the Emergent account as the primary sign-in and GitHub as the secondary', () => {
    const signIn = vi.fn();
    render(
      <SessionHarness session={makeSessionValue({ signIn })}>
        <SignedOutLanding />
      </SessionHarness>,
    );

    expect(screen.getByTestId('landing-sign-in')).toHaveTextContent('Sign in with your Emergent account');
    expect(screen.getByTestId('landing-sign-in-github')).toHaveTextContent('Sign in with GitHub');
    expect(screen.getByText(/Emergent Software staff and members of the/)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('landing-sign-in'));
    expect(signIn).toHaveBeenLastCalledWith('entra', undefined);

    fireEvent.click(screen.getByTestId('landing-sign-in-github'));
    expect(signIn).toHaveBeenLastCalledWith('github', undefined);
  });

  it('passes the stashed return path to whichever provider is clicked', () => {
    window.sessionStorage.setItem(SESSION_STORAGE_KEYS.pendingReturn, '/bundles');
    const signIn = vi.fn();
    render(
      <SessionHarness session={makeSessionValue({ signIn })}>
        <SignedOutLanding />
      </SessionHarness>,
    );

    fireEvent.click(screen.getByTestId('landing-sign-in-github'));
    expect(signIn).toHaveBeenCalledWith('github', '/bundles');
    expect(window.sessionStorage.getItem(SESSION_STORAGE_KEYS.pendingReturn)).toBeNull();
  });

  it('shows the session notice above the buttons and lets the user dismiss it', () => {
    const dismissNotice = vi.fn();
    render(
      <SessionHarness
        session={makeSessionValue({
          dismissNotice,
          notice: { kind: 'github_auth_retired', message: 'GitHub sign-in to ATK ended on 2026-09-14.' },
        })}
      >
        <SignedOutLanding />
      </SessionHarness>,
    );

    const notice = screen.getByTestId('session-notice');
    expect(notice).toHaveTextContent('GitHub sign-in to ATK ended on 2026-09-14.');
    expect(notice).toHaveAttribute('data-kind', 'github_auth_retired');
    expect(
      notice.compareDocumentPosition(screen.getByTestId('landing-sign-in')) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /dismiss notice/i }));
    expect(dismissNotice).toHaveBeenCalledTimes(1);
  });

  it('renders no notice when there is none', () => {
    render(
      <SessionHarness session={makeSessionValue()}>
        <SignedOutLanding />
      </SessionHarness>,
    );
    expect(screen.queryByTestId('session-notice')).not.toBeInTheDocument();
  });
});
