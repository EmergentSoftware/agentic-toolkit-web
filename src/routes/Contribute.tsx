import { PageHeader } from '@/components/PageHeader';

export function ContributeRoute() {
  return (
    <>
      <PageHeader
        description='Draft a new asset or bundle and open a pull request against the registry.'
        title='Contribute'
      />
      <section aria-label='Contribute placeholder' className='text-sm text-muted-foreground'>
        The contribution wizard is delivered in Phase 10.
      </section>
    </>
  );
}

export default ContributeRoute;
