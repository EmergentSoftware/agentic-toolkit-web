import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';

import { LoadingIndicator } from '@/components/LoadingIndicator';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { useSession } from '@/hooks/useSession';
import { consumeOAuthState, exchangeCodeForToken } from '@/lib/session';

/**
 * Read OAuth callback parameters from the URL.
 *
 * GitHub appends `?code=...&state=...` to the redirect URI *before* any
 * fragment (RFC 6749). Under HashRouter this means the params sit in
 * `window.location.search`, not inside the hash-router's search — so we must
 * read them off the raw URL rather than using `useSearchParams()`.
 *
 * We also accept params placed inside the hash (`#/auth/callback?code=...`)
 * as a fallback, which is how some OAuth providers behave.
 */
function readCallbackParams(): { code: null | string; state: null | string } {
  const fromSearch = new URLSearchParams(window.location.search);
  if (fromSearch.has('code') || fromSearch.has('state')) {
    return { code: fromSearch.get('code'), state: fromSearch.get('state') };
  }
  const hash = window.location.hash;
  const queryIndex = hash.indexOf('?');
  if (queryIndex >= 0) {
    const fromHash = new URLSearchParams(hash.slice(queryIndex + 1));
    return { code: fromHash.get('code'), state: fromHash.get('state') };
  }
  return { code: null, state: null };
}

/** Strip the OAuth params from the visible URL so `code`/`state` don't leak into history. */
function scrubUrl(): void {
  const cleanUrl = `${window.location.origin}${window.location.pathname}`;
  window.history.replaceState({}, '', cleanUrl);
}

export function AuthCallbackRoute() {
  const navigate = useNavigate();
  const { completeSignIn } = useSession();
  const [error, setError] = useState<null | string>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const { code, state } = readCallbackParams();
    const stored = consumeOAuthState();

    if (!code || !state) {
      setError('Missing code or state parameter from the GitHub callback.');
      return;
    }
    if (!stored || stored.state !== state) {
      setError('OAuth state mismatch — this sign-in request cannot be verified.');
      return;
    }

    // Intentionally no AbortController: a one-time OAuth code exchange has no
    // reason to be cancelled, and aborting on React StrictMode's synthetic
    // unmount kills the in-flight request before it completes (dev-only
    // "signal is aborted without reason" error).
    exchangeCodeForToken(code)
      .then((token) => {
        completeSignIn(token);
        scrubUrl();
        navigate(stored.returnPath || '/', { replace: true });
      })
      .catch((cause: unknown) => {
        const message = cause instanceof Error ? cause.message : String(cause);
        setError(message);
      });
  }, [completeSignIn, navigate]);

  if (error) {
    return (
      <>
        <PageHeader description='We could not complete your GitHub sign-in.' title='Sign-in failed' />
        <section aria-label='Sign-in error' className='flex flex-col gap-4'>
          <p className='text-sm text-destructive' data-testid='auth-callback-error'>
            {error}
          </p>
          <div>
            <Button onClick={() => navigate('/', { replace: true })} size='sm' variant='outline'>
              Return home
            </Button>
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <PageHeader description='Completing your GitHub sign-in…' title='Signing in' />
      <LoadingIndicator label='Exchanging authorization code…' />
    </>
  );
}

export default AuthCallbackRoute;
