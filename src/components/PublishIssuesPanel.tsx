import type { ApiErrorDetail } from '@/lib/api-client';

interface PublishIssuesPanelProps {
  /** Problems reported by the registry API (`details[]` of a 400 `validation_failed` / `schema_invalid`). */
  issues: ApiErrorDetail[];
  /** Noun used in the heading, e.g. "contribution" or "bundle". */
  subject: string;
}

/**
 * Lists the per-item problems the ATK API returned when it rejected a publish
 * payload. Each item carries a JSON pointer into the payload (`/manifest/name`,
 * `/files/0/path`, ...) when the API could attribute it.
 */
export function PublishIssuesPanel({ issues, subject }: PublishIssuesPanelProps) {
  if (issues.length === 0) return null;
  return (
    <div
      className='rounded-md border border-destructive/50 bg-destructive/5 p-4'
      data-testid='review-publish-issues'
      role='alert'
    >
      <p className='pb-1 text-sm font-semibold text-destructive'>The registry rejected this {subject}:</p>
      <ul className='list-disc pl-5 text-sm text-destructive'>
        {issues.map((issue, i) => (
          <li key={`${issue.path ?? ''}-${i}`}>
            {issue.path ? <span className='font-mono text-xs'>{issue.path}: </span> : null}
            {issue.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
