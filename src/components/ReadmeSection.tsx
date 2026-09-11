import { LoadingIndicator } from '@/components/LoadingIndicator';
import { MarkdownRenderer } from '@/components/MarkdownRenderer';

interface ReadmeSectionProps {
  /** Accessible name for the section, e.g. `Asset README`. */
  ariaLabel: string;
  /** Copy shown when the README is absent or failed to load. */
  emptyMessage: string;
  isError: boolean;
  isLoading: boolean;
  readme: null | string | undefined;
  /** Section testid; the fallback paragraph uses `${testId}-missing`. */
  testId: string;
}

/**
 * The README block shared by the asset and bundle detail pages: heading,
 * loading skeleton, "no README" fallback, and rendered markdown.
 */
export function ReadmeSection({ ariaLabel, emptyMessage, isError, isLoading, readme, testId }: ReadmeSectionProps) {
  return (
    <section aria-label={ariaLabel} data-testid={testId}>
      <h2 className='mb-3 text-lg font-semibold tracking-tight text-foreground'>README</h2>
      <ReadmeBody emptyMessage={emptyMessage} isError={isError} isLoading={isLoading} readme={readme} testId={testId} />
    </section>
  );
}

function ReadmeBody({ emptyMessage, isError, isLoading, readme, testId }: Omit<ReadmeSectionProps, 'ariaLabel'>) {
  if (isLoading) {
    return <LoadingIndicator label='Loading README…' variant='skeleton' />;
  }
  if (isError || !readme) {
    return (
      <p className='text-sm text-muted-foreground' data-testid={`${testId}-missing`}>
        {emptyMessage}
      </p>
    );
  }
  return <MarkdownRenderer content={readme} />;
}
