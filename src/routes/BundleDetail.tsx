import { useParams } from 'react-router';

import { PageHeader } from '@/components/PageHeader';

export function BundleDetailRoute() {
  const { bundleId } = useParams();

  return (
    <>
      <PageHeader
        description={
          bundleId ? `Assets and metadata for the "${bundleId}" bundle.` : 'Bundle details will render here.'
        }
        title='Bundle detail'
      />
      <section aria-label='Bundle detail placeholder' className='text-sm text-muted-foreground'>
        Bundle contents, dependency tree, and README arrive in a later phase.
      </section>
    </>
  );
}

export default BundleDetailRoute;
