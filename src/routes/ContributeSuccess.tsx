import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DRY_RUN_PR_URL_MARKER } from '@/lib/publish-service';

import { clearDraftFromStorage } from './Contribute';

export interface ContributeSuccessState {
  branchName?: string;
  dryRun?: boolean;
  prUrl: string;
}

export function ContributeSuccessRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? null) as ContributeSuccessState | null;

  useEffect(() => {
    if (!state || !state.prUrl) {
      navigate('/contribute', { replace: true });
    }
  }, [navigate, state]);

  if (!state || !state.prUrl) return null;

  const isDryRun = state.dryRun || state.prUrl === DRY_RUN_PR_URL_MARKER;

  const startAnother = () => {
    clearDraftFromStorage();
    navigate('/contribute', { replace: true });
  };

  return (
    <>
      <PageHeader
        description='Thanks for contributing — a maintainer will review your pull request shortly.'
        title='Contribution submitted'
      />
      <section aria-labelledby='contribute-success-heading' className='space-y-6'>
        <Card>
          <CardHeader>
            <CardTitle id='contribute-success-heading'>
              {isDryRun ? 'Dry run completed' : 'Your pull request is open'}
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            {isDryRun ? (
              <p className='text-sm text-muted-foreground' data-testid='contribute-success-dry-run'>
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
                data-testid='contribute-success-pr-link'
                href={state.prUrl}
                rel='noopener noreferrer'
                target='_blank'
              >
                View pull request on GitHub
              </a>
            )}
            {state.branchName ? (
              <p className='text-xs text-muted-foreground' data-testid='contribute-success-branch'>
                Branch: <span className='font-mono'>{state.branchName}</span>
              </p>
            ) : null}
          </CardContent>
        </Card>
        <div className='flex items-center justify-end gap-2'>
          <Button data-testid='contribute-success-another' onClick={startAnother} type='button'>
            Contribute another
          </Button>
        </div>
      </section>
    </>
  );
}

export default ContributeSuccessRoute;
