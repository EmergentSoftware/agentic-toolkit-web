import { File, FileCode, FileJson, FileText, type LucideIcon } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export interface FileGroup {
  files: string[];
  name: string;
  testId?: string;
  version?: string;
}

interface FilesCardProps {
  error?: Error | null | string;
  groups: FileGroup[];
  isLoading?: boolean;
  testId?: string;
}

export function FilesCard({ error, groups, isLoading = false, testId = 'files-card' }: FilesCardProps) {
  return (
    <Card data-testid={testId}>
      <CardHeader>
        <CardTitle>Files</CardTitle>
      </CardHeader>
      <CardContent className='flex flex-col gap-6 text-sm'>
        {groups.map((group) => (
          <FileGroupView group={group} key={group.testId ?? group.name} />
        ))}
        {isLoading ? <FilesLoading /> : null}
        {error ? <FilesError message={typeof error === 'string' ? error : error.message} /> : null}
      </CardContent>
    </Card>
  );
}

function FileGroupView({ group }: { group: FileGroup }) {
  return (
    <div className='flex flex-col gap-2' data-testid={group.testId}>
      <div className='flex flex-wrap items-baseline gap-2'>
        <span className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>
          {group.name}
        </span>
        {group.version ? (
          <span className='text-xs text-muted-foreground'>v{group.version}</span>
        ) : null}
      </div>
      <ul className='flex flex-col gap-1'>
        {group.files.map((path) => {
          const Icon = iconForPath(path);
          return (
            <li className='flex items-center gap-2 text-sm text-foreground' key={path}>
              <Icon aria-hidden='true' className='size-4 shrink-0 text-muted-foreground' />
              <span className='font-mono text-xs'>{path}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function FilesError({ message }: { message: string }) {
  return (
    <div
      className='rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs'
      data-testid='files-card-error'
      role='alert'
    >
      <p className='font-medium text-foreground'>Failed to load dependency files.</p>
      <p className='text-muted-foreground'>{message}</p>
    </div>
  );
}

function FilesLoading() {
  return (
    <div
      aria-busy='true'
      aria-label='Loading dependency files'
      className='flex flex-col gap-2'
      data-testid='files-card-loading'
      role='status'
    >
      <Skeleton className='h-3 w-24' />
      <Skeleton className='h-3 w-2/3' />
      <Skeleton className='h-3 w-1/2' />
    </div>
  );
}

function iconForPath(path: string): LucideIcon {
  const lower = path.toLowerCase();
  const dot = lower.lastIndexOf('.');
  const ext = dot >= 0 ? lower.slice(dot + 1) : '';
  if (ext === 'json') return FileJson;
  if (ext === 'md' || ext === 'mdx' || ext === 'txt') return FileText;
  if (
    ext === 'ts' ||
    ext === 'tsx' ||
    ext === 'js' ||
    ext === 'jsx' ||
    ext === 'mjs' ||
    ext === 'cjs' ||
    ext === 'py' ||
    ext === 'rb' ||
    ext === 'go' ||
    ext === 'rs' ||
    ext === 'sh' ||
    ext === 'yaml' ||
    ext === 'yml' ||
    ext === 'toml'
  ) {
    return FileCode;
  }
  return File;
}
