import { PageHeader } from '@/components/PageHeader';

export function NotAuthorizedRoute() {
  return (
    <>
      <PageHeader
        description='Your GitHub account is not a member of the Emergent Software organization.'
        title='Not authorized'
      />
      <section aria-label='Not-authorized explanation' className='text-sm text-muted-foreground'>
        Request access from an organization admin and try signing in again.
      </section>
    </>
  );
}

export default NotAuthorizedRoute;
