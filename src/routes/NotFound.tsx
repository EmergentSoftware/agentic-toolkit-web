import { Link, useLocation } from 'react-router';

import { PageHeader } from '@/components/PageHeader';
import { buttonVariants } from '@/components/ui/button';

export function NotFoundRoute() {
  const location = useLocation();

  return (
    <>
      <PageHeader description={`No page matches "${location.pathname}".`} title='Page not found' />
      <section aria-label='Not-found recovery' className='flex flex-col items-start gap-4 text-sm text-muted-foreground'>
        <p>Double-check the URL, or head back to browse the registry.</p>
        <Link className={buttonVariants({ variant: 'outline' })} to='/'>
          Back to Browse
        </Link>
      </section>
    </>
  );
}

export default NotFoundRoute;
