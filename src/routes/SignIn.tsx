import { PageHeader } from '@/components/PageHeader';

export function SignInRoute() {
  return (
    <>
      <PageHeader
        description='Authenticate with your GitHub account to access Emergent Software private assets.'
        title='Sign in'
      />
      <section aria-label='Sign-in placeholder' className='text-sm text-muted-foreground'>
        GitHub device-flow authentication is wired up in a later phase.
      </section>
    </>
  );
}

export default SignInRoute;
