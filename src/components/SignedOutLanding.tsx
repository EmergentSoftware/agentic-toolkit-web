import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useSession } from '@/hooks/useSession';
import { consumePendingReturnPath } from '@/lib/session';

/** Friendly intro shown at `/` when the viewer is signed out. */
export function SignedOutLanding() {
  const { dismissNotice, notice, signIn } = useSession();

  return (
    <section
      aria-label='Sign in to Agentic Toolkit'
      className='mx-auto flex max-w-2xl flex-col items-center gap-6 py-16 text-center'
      data-testid='signed-out-landing'
    >
      <img alt='' aria-hidden='true' className='h-16 w-16' src={`${import.meta.env.BASE_URL}logomark.svg`} />
      <div className='flex flex-col gap-3'>
        <h1 className='text-4xl font-semibold tracking-tight text-foreground'>Agentic Toolkit</h1>
        <p className='text-base text-muted-foreground'>
          A curated registry of skills, agents, rules, hooks, and bundles for AI coding tools. Sign in to browse and
          download assets.
        </p>
        <p className='text-sm text-muted-foreground'>
          Access is limited to Emergent Software staff and members of the{' '}
          <strong className='text-foreground'>EmergentSoftware</strong> GitHub organization.
        </p>
      </div>
      {notice ? (
        <div
          className='flex w-full items-start gap-3 rounded-md border border-warning bg-warning/15 px-4 py-3 text-left text-sm text-foreground'
          data-kind={notice.kind}
          data-testid='session-notice'
          role='status'
        >
          <p className='flex-1'>{notice.message}</p>
          <Button aria-label='Dismiss notice' onClick={dismissNotice} size='icon' variant='ghost'>
            <X aria-hidden='true' />
          </Button>
        </div>
      ) : null}
      <div className='flex flex-col items-center gap-3'>
        <Button data-testid='landing-sign-in' onClick={() => signIn('entra', consumePendingReturnPath())} size='lg'>
          Sign in with your Emergent account
        </Button>
        <Button
          data-testid='landing-sign-in-github'
          onClick={() => signIn('github', consumePendingReturnPath())}
          size='sm'
          variant='outline'
        >
          Sign in with GitHub
        </Button>
      </div>
    </section>
  );
}
