import { Button } from '@/components/ui/button';
import { useSession } from '@/hooks/useSession';
import { consumePendingReturnPath } from '@/lib/session';

/** Friendly intro shown at `/` when the viewer is signed out. */
export function SignedOutLanding() {
  const { signIn } = useSession();

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
          A curated registry of skills, agents, rules, hooks, and bundles for AI coding tools.
          Sign in with your GitHub account to browse and download assets.
        </p>
        <p className='text-sm text-muted-foreground'>
          Access is limited to members of the <strong className='text-foreground'>EmergentSoftware</strong> organization.
        </p>
      </div>
      <Button
        data-testid='landing-sign-in'
        onClick={() => signIn(consumePendingReturnPath())}
        size='lg'
      >
        Sign in with GitHub
      </Button>
    </section>
  );
}
