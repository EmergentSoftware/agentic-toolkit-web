import { LoadingIndicator } from '@/components/LoadingIndicator';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';

/**
 * Renders a fetched README as markdown, with loading/missing states.
 * Shared between the asset and bundle detail pages so both surfaces stay
 * in sync — a bundle's README used to never render at all (only its
 * `setupInstructions` did) even though every published bundle has one.
 */
export function ReadmeView({
  isError,
  isLoading,
  missingTestId,
  readme,
}: {
  isError: boolean;
  isLoading: boolean;
  missingTestId?: string;
  readme: null | string;
}) {
  if (isLoading) {
    return <LoadingIndicator label='Loading README…' variant='skeleton' />;
  }
  if (isError || !readme) {
    return (
      <p className='text-sm text-muted-foreground' data-testid={missingTestId}>
        No README is available.
      </p>
    );
  }
  return <MarkdownRenderer content={readme} />;
}
