import { useEffect } from 'react';
import { Navigate } from 'react-router';

import { LoadingIndicator } from '@/components/LoadingIndicator';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { useSession } from '@/hooks/useSession';
import { consumePendingReturnPath } from '@/lib/session';

/**
 * Alternate direct-entry sign-in route. Kicks off the OAuth redirect immediately;
 * if the user is already signed in and a member, forwards them home.
 */
export function SignInRoute() {
  const { signIn, status } = useSession();

  useEffect(() => {
    if (status === 'signed-out') {
      signIn(consumePendingReturnPath());
    }
  }, [signIn, status]);

  if (status === 'member') return <Navigate replace to='/' />;
  if (status === 'non-member') return <Navigate replace to='/not-authorized' />;

  return (
    <>
      <PageHeader
        description='Redirecting to GitHub to authenticate…'
        title='Sign in'
      />
      <section aria-label='Sign-in progress' className='flex flex-col gap-4'>
        <LoadingIndicator label='Starting GitHub sign-in…' />
        <div>
          <Button
            onClick={() => signIn(consumePendingReturnPath())}
            size='sm'
            variant='outline'
          >
            Retry sign in
          </Button>
        </div>
      </section>
    </>
  );
}

export default SignInRoute;
