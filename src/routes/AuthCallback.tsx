import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

import { LoadingIndicator } from '@/components/LoadingIndicator';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { useSession } from '@/hooks/useSession';
import { consumeOAuthState, exchangeCodeForToken } from '@/lib/session';

export function AuthCallbackRoute() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { completeSignIn } = useSession();
  const [error, setError] = useState<null | string>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const stored = consumeOAuthState();

    if (!code || !state) {
      setError('Missing code or state parameter from the GitHub callback.');
      return;
    }
    if (!stored || stored.state !== state) {
      setError('OAuth state mismatch — this sign-in request cannot be verified.');
      return;
    }

    const controller = new AbortController();
    exchangeCodeForToken(code, controller.signal)
      .then((token) => {
        completeSignIn(token);
        navigate(stored.returnPath || '/', { replace: true });
      })
      .catch((cause: unknown) => {
        const message = cause instanceof Error ? cause.message : String(cause);
        setError(message);
      });

    return () => controller.abort();
  }, [completeSignIn, navigate, searchParams]);

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
