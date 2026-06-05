import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DRY_RUN_PR_URL_MARKER } from '@/lib/publish-service';

import { clearBundleDraftFromStorage } from './CreateBundle';

export interface CreateBundleSuccessState {
  branchName?: string;
  dryRun?: boolean;
  prUrl: string;
}

export function CreateBundleSuccessRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? null) as CreateBundleSuccessState | null;

  useEffect(() => {
    if (!state || !state.prUrl) {
      navigate('/bundles/new', { replace: true });
    }
  }, [navigate, state]);

  if (!state || !state.prUrl) return null;

  const isDryRun = state.dryRun || state.prUrl === DRY_RUN_PR_URL_MARKER;

  const createAnother = () => {
    clearBundleDraftFromStorage();
    navigate('/bundles/new', { replace: true });
  };

  return (
    <>
      <PageHeader
        description='Thanks for contributing — a maintainer will review your pull request shortly.'
        title='Bundle submitted'
      />
      <section aria-labelledby='create-bundle-success-heading' className='space-y-6'>
        <Card>
          <CardHeader>
            <CardTitle id='create-bundle-success-heading'>
              {isDryRun ? 'Dry run completed' : 'Your pull request is open'}
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            {isDryRun ? (
              <p className='text-sm text-muted-foreground' data-testid='create-bundle-success-dry-run'>
                No pull request was created. This was a dry run so you could preview the flow end to end.
              </p>
            ) : (
              <p className='text-sm text-muted-foreground'>
                A maintainer from EmergentSoftware will review your submission. You can track its status on GitHub.
              </p>
            )}
            {isDryRun ? null : (
              <a
                className='inline-flex items-center gap-2 text-sm font-medium text-primary underline underline-offset-4 hover:text-primary/80'
                data-testid='create-bundle-success-pr-link'
                href={state.prUrl}
                rel='noopener noreferrer'
                target='_blank'
              >
                View pull request on GitHub
              </a>
            )}
            {state.branchName ? (
              <p className='text-xs text-muted-foreground' data-testid='create-bundle-success-branch'>
                Branch: <span className='font-mono'>{state.branchName}</span>
              </p>
            ) : null}
          </CardContent>
        </Card>
        <div className='flex items-center justify-end gap-2'>
          <Button data-testid='create-bundle-success-another' onClick={createAnother} type='button'>
            Create another bundle
          </Button>
        </div>
      </section>
    </>
  );
}

export default CreateBundleSuccessRoute;
