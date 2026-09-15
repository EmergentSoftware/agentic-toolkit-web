import { useQueryState } from 'nuqs';
import { useEffect } from 'react';
import { Navigate } from 'react-router';

import { LoadingIndicator } from '@/components/LoadingIndicator';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { useSession } from '@/hooks/useSession';
import { consumePendingReturnPath, type SessionScheme } from '@/lib/session';

/**
 * Alternate direct-entry sign-in route. Kicks off the redirect immediately:
 * Entra by default, GitHub with `?provider=github`. If the user is already
 * signed in and a member, forwards them home.
 */
export function SignInRoute() {
  const { signIn, status } = useSession();
  const [providerParam] = useQueryState('provider');
  const provider: SessionScheme = providerParam === 'github' ? 'github' : 'entra';
  const providerLabel = provider === 'github' ? 'GitHub' : 'Microsoft';

  useEffect(() => {
    if (status === 'signed-out') {
      signIn(provider, consumePendingReturnPath());
    }
  }, [provider, signIn, status]);

  if (status === 'member') return <Navigate replace to='/' />;
  if (status === 'non-member') return <Navigate replace to='/not-authorized' />;

  return (
    <>
      <PageHeader description={`Redirecting to ${providerLabel} to authenticate…`} title='Sign in' />
      <section aria-label='Sign-in progress' className='flex flex-col gap-4'>
        <LoadingIndicator label={`Starting ${providerLabel} sign-in…`} />
        <div>
          <Button onClick={() => signIn(provider, consumePendingReturnPath())} size='sm' variant='outline'>
            Retry sign in
          </Button>
        </div>
      </section>
    </>
  );
}

export default SignInRoute;
