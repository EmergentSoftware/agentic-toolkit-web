import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { useSession } from '@/hooks/useSession';

export function NotAuthorizedRoute() {
  const { signOut, user } = useSession();

  return (
    <>
      <PageHeader
        description='Your GitHub account is not a member of the Emergent Software organization.'
        title='Not authorized'
      />
      <section
        aria-label='Not-authorized explanation'
        className='flex flex-col gap-4 text-sm text-muted-foreground'
        data-testid='not-authorized-content'
      >
        {user ? (
          <p>
            You are signed in as <strong>{user.login}</strong>, but this account does not
            have access to the Emergent Software registry.
          </p>
        ) : null}
        <p>
          The Agentic Toolkit registry is gated on membership of the{' '}
          <strong>EmergentSoftware</strong> GitHub organization. If you believe you should
          have access:
        </p>
        <ul className='list-inside list-disc space-y-1'>
          <li>Ask a repo admin to add your GitHub account to the org.</li>
          <li>
            Make sure your org membership is set to <em>public</em>, or grant the{' '}
            <code>read:org</code> scope when signing in.
          </li>
          <li>Sign out and retry with a different account.</li>
        </ul>
        <div>
          <Button onClick={signOut} size='sm' variant='outline'>
            Sign out
          </Button>
        </div>
      </section>
    </>
  );
}

export default NotAuthorizedRoute;
