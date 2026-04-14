import { type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';

import { LoadingIndicator } from '@/components/LoadingIndicator';
import { useSession } from '@/hooks/useSession';
import { stashPendingReturnPath } from '@/lib/session';

interface RequireAuthProps {
  children: ReactNode;
}

/**
 * Route guard that allows the active session to reach `children` only when the
 * user is a verified member of the Emergent Software org. Unauthenticated users
 * are redirected to `/` (after stashing their intended path for restoration on
 * sign-in) and non-members are redirected to `/not-authorized`.
 */
export function RequireAuth({ children }: RequireAuthProps) {
  const { status } = useSession();
  const location = useLocation();

  if (status === 'signed-out') {
    const pending = `${location.pathname}${location.search}${location.hash}`;
    stashPendingReturnPath(pending);
    return <Navigate replace to='/' />;
  }

  if (status === 'non-member') {
    return <Navigate replace to='/not-authorized' />;
  }

  if (status === 'authenticating' || status === 'verifying') {
    return (
      <div
        className='flex min-h-[60vh] items-center justify-center'
        data-testid='require-auth-loading'
      >
        <LoadingIndicator label='Verifying your GitHub org membership…' />
      </div>
    );
  }

  return <>{children}</>;
}
