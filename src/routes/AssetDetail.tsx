import { useParams } from 'react-router';

import { PageHeader } from '@/components/PageHeader';

export function AssetDetailRoute() {
  const { assetId } = useParams();

  return (
    <>
      <PageHeader
        description={assetId ? `Detailed metadata and README for "${assetId}".` : 'Asset details will render here.'}
        title='Asset detail'
      />
      <section aria-label='Asset detail placeholder' className='text-sm text-muted-foreground'>
        Manifest rendering and README preview ship in Phase 4.
      </section>
    </>
  );
}

export default AssetDetailRoute;
