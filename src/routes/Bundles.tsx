import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from '@tanstack/react-table';
import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';

import type { RegistryAsset, RegistryBundle } from '@/lib/schemas/registry';

import { EmptyState } from '@/components/EmptyState';
import { FilterGroup } from '@/components/FilterGroup';
import { LoadingIndicator } from '@/components/LoadingIndicator';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useDownloadBundle } from '@/hooks/useDownloadBundle';
import { useRegistry } from '@/hooks/useRegistry';
import { rankBundleNames } from '@/lib/search';
import { cn } from '@/lib/utils';

interface BundleRow {
  assetCount: number;
  author: string;
  description: string;
  name: string;
  org: string;
  tags: string[];
  version: string;
}

interface BundlesCardListProps {
  isDownloading: (name: string) => boolean;
  onCardClick: (row: BundleRow) => void;
  onDownload: (row: BundleRow) => void;
  rows: BundleRow[];
}

interface BundlesTableProps {
  onRowClick: (row: BundleRow) => void;
  table: ReturnType<typeof useReactTable<BundleRow>>;
}

export function BundlesRoute() {
  const { data, error, isError, isLoading } = useRegistry();
  const navigate = useNavigate();
  const { download, isDownloading } = useDownloadBundle();

  const [search, setSearch] = useState('');
  const [tagFilter, setTagFilter] = useState<Set<string>>(new Set());
  const [orgOnly, setOrgOnly] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);

  const bundles = useMemo<RegistryBundle[]>(() => data?.bundles ?? [], [data]);
  const assets = useMemo<RegistryAsset[]>(() => data?.assets ?? [], [data]);

  const resolveVersion = useCallback(
    (member: { name: string; org?: string; type: string }) => {
      const match = assets.find(
        (asset) => asset.name === member.name && asset.type === member.type && (asset.org ?? undefined) === member.org,
      );
      return match?.latest;
    },
    [assets],
  );

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    for (const bundle of bundles) bundle.tags.forEach((t) => tags.add(t));
    return [...tags].sort();
  }, [bundles]);

  const rows = useMemo<BundleRow[]>(() => {
    const filtered = bundles.filter((bundle) => {
      if (tagFilter.size > 0 && !bundle.tags.some((t) => tagFilter.has(t))) return false;
      if (orgOnly && !bundle.org) return false;
      return true;
    });

    const trimmed = search.trim();
    let ordered: RegistryBundle[];
    if (trimmed) {
      const ranked = rankBundleNames(filtered, trimmed);
      const byName = new Map(filtered.map((b) => [b.name, b]));
      ordered = ranked.map((name) => byName.get(name)!).filter(Boolean);
    } else {
      ordered = [...filtered].sort((a, b) => a.name.localeCompare(b.name));
    }

    return ordered.map(toRow);
  }, [bundles, tagFilter, orgOnly, search]);

  const columns = useMemo<ColumnDef<BundleRow>[]>(
    () => [
      {
        accessorKey: 'name',
        cell: ({ row }) => <span className='font-medium text-foreground'>{row.original.name}</span>,
        header: 'Name',
      },
      {
        accessorKey: 'version',
        cell: ({ row }) => <span className='text-muted-foreground'>{row.original.version}</span>,
        header: 'Version',
      },
      {
        accessorKey: 'author',
        cell: ({ row }) => <span className='text-muted-foreground'>{row.original.author}</span>,
        header: 'Author',
      },
      {
        accessorKey: 'description',
        cell: ({ row }) => (
          <span className='line-clamp-2 text-muted-foreground'>{row.original.description}</span>
        ),
        enableSorting: false,
        header: 'Description',
      },
      {
        accessorKey: 'tags',
        cell: ({ row }) => (
          <div className='flex flex-wrap gap-1'>
            {row.original.tags.map((tag) => (
              <Badge key={tag} variant='outline'>
                {tag}
              </Badge>
            ))}
          </div>
        ),
        enableSorting: false,
        header: 'Tags',
      },
      {
        accessorKey: 'org',
        cell: ({ row }) =>
          row.original.org ? (
            <Badge variant='secondary'>{row.original.org}</Badge>
          ) : (
            <span className='text-xs text-muted-foreground'>global</span>
          ),
        header: 'Org scope',
      },
      {
        accessorKey: 'assetCount',
        cell: ({ row }) => <span className='text-muted-foreground'>{row.original.assetCount}</span>,
        header: 'Assets',
      },
      {
        cell: ({ row }) => {
          const loading = isDownloading(row.original.name);
          return (
            <DownloadBundleButton
              isLoading={loading}
              name={row.original.name}
              onClick={(event) => {
                event.stopPropagation();
                void download(row.original.name, { resolveVersion });
              }}
            />
          );
        },
        enableSorting: false,
        header: 'Actions',
        id: 'actions',
      },
    ],
    [download, isDownloading, resolveVersion],
  );

  const table = useReactTable({
    columns,
    data: rows,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onSortingChange: setSorting,
    state: { sorting },
  });

  const navigateToBundle = (row: BundleRow) => navigate(`/bundles/${encodeURIComponent(row.name)}`);

  const toggleInSet = <T,>(set: Set<T>, value: T, setSet: (s: Set<T>) => void) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setSet(next);
  };

  const clearAll = () => {
    setSearch('');
    setTagFilter(new Set());
    setOrgOnly(false);
  };

  const hasActiveFilters = search.trim() !== '' || tagFilter.size > 0 || orgOnly;

  return (
    <>
      <PageHeader
        description='Search and download curated bundles that group related assets into a single installable unit.'
        title='Browse bundles'
      />

      <section aria-label='Bundle filters' className='mb-6 flex flex-col gap-4'>
        <div className='flex flex-col gap-2 md:flex-row md:items-center'>
          <label className='flex-1' htmlFor='bundles-search'>
            <span className='sr-only'>Search bundles</span>
            <Input
              autoComplete='off'
              id='bundles-search'
              onChange={(event) => setSearch(event.target.value)}
              placeholder='Search bundles by name, description, tag, or author…'
              type='search'
              value={search}
            />
          </label>
          <div className='flex items-center gap-2'>
            <label
              className='flex cursor-pointer items-center gap-2 text-sm text-foreground'
              htmlFor='bundles-org-toggle'
            >
              <Checkbox
                checked={orgOnly}
                id='bundles-org-toggle'
                onChange={(event) => setOrgOnly(event.target.checked)}
              />
              Org-scoped only
            </label>
            {hasActiveFilters ? (
              <Button onClick={clearAll} size='sm' variant='ghost'>
                Clear filters
              </Button>
            ) : null}
          </div>
        </div>

        <div className='grid gap-4 md:grid-cols-1'>
          <FilterGroup
            emptyLabel='No tags available'
            label='Tags'
            onToggle={(value) => toggleInSet(tagFilter, value, setTagFilter)}
            options={allTags}
            selected={tagFilter}
          />
        </div>
      </section>

      {isLoading ? (
        <LoadingIndicator label='Loading registry…' variant='skeleton' />
      ) : isError ? (
        <div
          className='rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-sm'
          data-testid='bundles-error'
          role='alert'
        >
          <p className='font-medium text-foreground'>Failed to load the registry.</p>
          <p className='text-muted-foreground'>{error?.message ?? 'Unknown error.'}</p>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          description={
            hasActiveFilters
              ? 'No bundles match the active filters. Try clearing a filter or adjusting your search.'
              : 'The registry does not publish any bundles yet.'
          }
          title='No matching bundles'
        />
      ) : (
        <>
          <BundlesTable onRowClick={navigateToBundle} table={table} />
          <BundlesCardList
            isDownloading={isDownloading}
            onCardClick={navigateToBundle}
            onDownload={(row) => void download(row.name, { resolveVersion })}
            rows={rows}
          />
        </>
      )}
    </>
  );
}

function BundlesCardList({ isDownloading, onCardClick, onDownload, rows }: BundlesCardListProps) {
  return (
    <ul
      aria-label='Registry bundles (compact)'
      className='flex flex-col gap-3 md:hidden'
      data-testid='bundles-card-list'
    >
      {rows.map((row) => (
        <li key={row.name}>
          <Card
            className='cursor-pointer'
            data-testid={`bundles-card-${row.name}`}
            onClick={() => onCardClick(row)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onCardClick(row);
              }
            }}
            role='link'
            tabIndex={0}
          >
            <CardHeader>
              <div className='flex items-start justify-between gap-2'>
                <CardTitle>{row.name}</CardTitle>
                <Badge variant='secondary'>{row.assetCount} assets</Badge>
              </div>
              <CardDescription>{row.description}</CardDescription>
            </CardHeader>
            <CardContent className='flex flex-col gap-3 text-sm'>
              <div className='flex items-center gap-2 text-muted-foreground'>
                <span>v{row.version}</span>
                <span aria-hidden='true'>·</span>
                <span>{row.author}</span>
                <span aria-hidden='true'>·</span>
                <span>{row.org || 'global'}</span>
              </div>
              {row.tags.length > 0 ? (
                <div className='flex flex-wrap gap-1'>
                  {row.tags.map((tag) => (
                    <Badge key={tag} variant='outline'>
                      {tag}
                    </Badge>
                  ))}
                </div>
              ) : null}
              <DownloadBundleButton
                isLoading={isDownloading(row.name)}
                name={row.name}
                onClick={(event) => {
                  event.stopPropagation();
                  onDownload(row);
                }}
              />
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}

function BundlesTable({ onRowClick, table }: BundlesTableProps) {
  return (
    <div className='hidden md:block' data-testid='bundles-table-wrapper'>
      <Table aria-label='Registry bundles'>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const canSort = header.column.getCanSort();
                const sortState = header.column.getIsSorted();
                return (
                  <TableHead key={header.id}>
                    {canSort ? (
                      <button
                        className={cn(
                          'inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground',
                          sortState && 'text-foreground',
                        )}
                        onClick={header.column.getToggleSortingHandler()}
                        type='button'
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {sortState === 'asc' ? ' ↑' : sortState === 'desc' ? ' ↓' : ''}
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow
              aria-label={`Open ${row.original.name}`}
              className='cursor-pointer'
              data-testid={`bundles-row-${row.original.name}`}
              key={row.id}
              onClick={() => onRowClick(row.original)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onRowClick(row.original);
                }
              }}
              role='link'
              tabIndex={0}
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function DownloadBundleButton({
  isLoading,
  name,
  onClick,
}: {
  isLoading: boolean;
  name: string;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <Button
      aria-busy={isLoading || undefined}
      aria-label={`Download ${name}`}
      data-testid={`bundles-download-${name}`}
      disabled={isLoading}
      onClick={onClick}
      size='sm'
      variant='outline'
    >
      {isLoading ? (
        <span
          aria-hidden='true'
          className='mr-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent'
        />
      ) : null}
      {isLoading ? 'Downloading…' : 'Download'}
    </Button>
  );
}

function toRow(bundle: RegistryBundle): BundleRow {
  return {
    assetCount: bundle.assetCount,
    author: bundle.author,
    description: bundle.description,
    name: bundle.name,
    org: bundle.org ?? '',
    tags: bundle.tags,
    version: bundle.version,
  };
}

export default BundlesRoute;
