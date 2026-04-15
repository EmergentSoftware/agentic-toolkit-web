import { Popover } from '@base-ui-components/react/popover';
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from '@tanstack/react-table';
import { Building2, Columns3, Hash, X } from 'lucide-react';
import { parseAsArrayOf, parseAsString, useQueryStates } from 'nuqs';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';

import type { RegistryAsset, RegistryBundle } from '@/lib/schemas/registry';

import { EmptyState } from '@/components/EmptyState';
import { useFullWidthLayout } from '@/components/layout/LayoutWidthContext';
import { LoadingIndicator } from '@/components/LoadingIndicator';
import { MultiSelectFilter } from '@/components/MultiSelectFilter';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip } from '@/components/ui/tooltip';
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

const ALL_COLUMN_IDS = [
  'name',
  'version',
  'author',
  'description',
  'tags',
  'org',
  'assetCount',
  'actions',
] as const;
type ColumnId = (typeof ALL_COLUMN_IDS)[number];

const COLUMN_VISIBILITY_STORAGE_KEY = 'atk.bundles.columnVisibility';
const SHOW_ORG_SCOPED_STORAGE_KEY = 'atk.bundles.showOrgScoped';

const DEFAULT_COLUMN_VISIBILITY: VisibilityState = { author: false, tags: false };

interface BundlesCardListProps {
  isDownloading: (name: string) => boolean;
  onCardClick: (row: BundleRow) => void;
  onDownload: (row: BundleRow) => void;
  rows: BundleRow[];
}

interface BundlesTableProps {
  columnsControl: React.ReactNode;
  onRowClick: (row: BundleRow) => void;
  table: ReturnType<typeof useReactTable<BundleRow>>;
}

export function BundlesRoute() {
  useFullWidthLayout();
  const { data, error, isError, isLoading } = useRegistry();
  const navigate = useNavigate();
  const { download, isDownloading } = useDownloadBundle();

  const [filters, setFilters] = useQueryStates({
    orgs: parseAsArrayOf(parseAsString).withDefault([]),
    q: parseAsString.withDefault(''),
    sort: parseAsString.withDefault(''),
    tags: parseAsArrayOf(parseAsString).withDefault([]),
  });

  const search = filters.q;
  const tagFilter = useMemo(() => new Set(filters.tags), [filters.tags]);
  const orgFilter = useMemo(() => new Set(filters.orgs), [filters.orgs]);
  const sorting = useMemo<SortingState>(() => parseSort(filters.sort), [filters.sort]);

  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(loadColumnVisibility);
  useEffect(() => {
    try {
      window.localStorage.setItem(
        COLUMN_VISIBILITY_STORAGE_KEY,
        JSON.stringify(columnVisibility),
      );
    } catch {
      /* ignore persistence errors */
    }
  }, [columnVisibility]);

  const [showOrgScoped, setShowOrgScoped] = useState<boolean>(loadShowOrgScoped);
  useEffect(() => {
    try {
      window.localStorage.setItem(SHOW_ORG_SCOPED_STORAGE_KEY, JSON.stringify(showOrgScoped));
    } catch {
      /* ignore persistence errors */
    }
  }, [showOrgScoped]);

  const bundles = useMemo<RegistryBundle[]>(() => data?.bundles ?? [], [data]);
  const assets = useMemo<RegistryAsset[]>(() => data?.assets ?? [], [data]);

  const resolveVersion = useCallback(
    (member: { name: string; org?: string; type: string }) => {
      const match = assets.find(
        (asset) =>
          asset.name === member.name &&
          asset.type === member.type &&
          (asset.org ?? undefined) === member.org,
      );
      return match?.latest;
    },
    [assets],
  );

  const { allOrgs, allTags } = useMemo(() => {
    const tags = new Set<string>();
    const orgs = new Set<string>();
    for (const bundle of bundles) {
      bundle.tags.forEach((t) => tags.add(t));
      if (bundle.org) orgs.add(bundle.org);
    }
    return {
      allOrgs: [...orgs].sort(),
      allTags: [...tags].sort(),
    };
  }, [bundles]);

  const rows = useMemo<BundleRow[]>(() => {
    const filtered = bundles.filter((bundle) => {
      if (!showOrgScoped && orgFilter.size === 0 && bundle.org) return false;
      if (tagFilter.size > 0 && !bundle.tags.some((t) => tagFilter.has(t))) return false;
      if (orgFilter.size > 0 && !(bundle.org && orgFilter.has(bundle.org))) return false;
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
  }, [bundles, tagFilter, orgFilter, search, showOrgScoped]);

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
          <Tooltip content={row.original.description} maxWidth='28rem'>
            <span className='line-clamp-2 text-muted-foreground'>{row.original.description}</span>
          </Tooltip>
        ),
        enableSorting: false,
        header: 'Description',
      },
      {
        accessorKey: 'tags',
        cell: ({ row }) => (
          <div className='flex flex-wrap gap-1'>
            {row.original.tags.map((tag) => (
              <Badge key={tag} shape='pill' variant='tag'>
                <Hash aria-hidden='true' className='h-3 w-3 opacity-70' />
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
            <Badge variant='org'>
              <Building2 aria-hidden='true' className='h-3 w-3 opacity-80' />
              {row.original.org}
            </Badge>
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
    onColumnVisibilityChange: setColumnVisibility,
    onSortingChange: (updater) => {
      const next = typeof updater === 'function' ? updater(sorting) : updater;
      void setFilters({ sort: serializeSort(next) });
    },
    state: { columnVisibility, sorting },
  });

  const navigateToBundle = (row: BundleRow) => navigate(`/bundles/${encodeURIComponent(row.name)}`);

  const setSearch = (value: string) => void setFilters({ q: value });
  const setTagFilter = (next: Set<string>) => void setFilters({ tags: [...next] });
  const setOrgFilter = (next: Set<string>) => void setFilters({ orgs: [...next] });

  const clearAll = () => {
    void setFilters({ orgs: [], q: '', tags: [] });
  };

  const removeChip = (facet: 'orgs' | 'tags', value: string) => {
    const current = filters[facet];
    void setFilters({ [facet]: current.filter((v) => v !== value) });
  };

  const chips = useMemo<Array<{ facet: 'orgs' | 'tags'; value: string }>>(() => {
    const items: Array<{ facet: 'orgs' | 'tags'; value: string }> = [];
    for (const v of filters.tags) items.push({ facet: 'tags', value: v });
    for (const v of filters.orgs) items.push({ facet: 'orgs', value: v });
    return items;
  }, [filters]);

  const hasActiveFilters = chips.length > 0 || search.trim() !== '';

  const columnsControl = <ColumnsPopover columns={ALL_COLUMN_IDS} table={table} />;

  return (
    <>
      <PageHeader
        description='Search and download curated bundles that group related assets into a single installable unit.'
        title='Browse bundles'
      />

      <section aria-label='Bundle filters' className='mb-6 flex flex-col gap-3'>
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
        </div>

        <div className='flex flex-wrap items-center gap-2'>
          <MultiSelectFilter
            data-testid='filter-tags'
            emptyLabel='No tags available'
            label='Tags'
            onChange={setTagFilter}
            options={allTags}
            selected={tagFilter}
          />
          <MultiSelectFilter
            data-testid='filter-orgs'
            emptyLabel='No orgs available'
            label='Orgs'
            onChange={setOrgFilter}
            options={allOrgs}
            selected={orgFilter}
          />
          <label
            className='flex cursor-pointer items-center gap-2 rounded-md border border-input bg-transparent px-3 py-1.5 text-sm text-foreground hover:border-primary/60 hover:bg-accent'
            htmlFor='toggle-show-org-scoped'
          >
            <Checkbox
              checked={showOrgScoped}
              data-testid='toggle-show-org-scoped'
              id='toggle-show-org-scoped'
              onChange={(event) => setShowOrgScoped(event.target.checked)}
            />
            <span>Show org-scoped bundles</span>
          </label>
          {hasActiveFilters ? (
            <Button
              className='ml-auto'
              data-testid='clear-all-filters'
              onClick={clearAll}
              size='sm'
              variant='ghost'
            >
              Clear all filters
            </Button>
          ) : null}
        </div>

        {chips.length > 0 ? (
          <div
            aria-label='Active filters'
            className='flex flex-wrap items-center gap-2'
            data-testid='active-filter-chips'
          >
            {chips.map((chip) => (
              <FilterChip
                key={`${chip.facet}:${chip.value}`}
                label={`${facetChipLabel(chip.facet)}: ${chip.value}`}
                onRemove={() => removeChip(chip.facet, chip.value)}
              />
            ))}
          </div>
        ) : null}
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
          <BundlesTable columnsControl={columnsControl} onRowClick={navigateToBundle} table={table} />
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
              <Tooltip content={row.description} maxWidth='22rem'>
                <CardDescription className='line-clamp-2'>{row.description}</CardDescription>
              </Tooltip>
            </CardHeader>
            <CardContent className='flex flex-col gap-3 text-sm'>
              <div className='flex flex-wrap items-center gap-2 text-muted-foreground'>
                <span>v{row.version}</span>
                <span aria-hidden='true'>·</span>
                <span>{row.author}</span>
                <span aria-hidden='true'>·</span>
                {row.org ? (
                  <Badge variant='org'>
                    <Building2 aria-hidden='true' className='h-3 w-3 opacity-80' />
                    {row.org}
                  </Badge>
                ) : (
                  <span>global</span>
                )}
              </div>
              {row.tags.length > 0 ? (
                <div className='flex flex-wrap gap-1'>
                  {row.tags.map((tag) => (
                    <Badge key={tag} shape='pill' variant='tag'>
                      <Hash aria-hidden='true' className='h-3 w-3 opacity-70' />
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

function BundlesTable({ columnsControl, onRowClick, table }: BundlesTableProps) {
  return (
    <div className='hidden md:block' data-testid='bundles-table-wrapper'>
      <div className='mb-2 flex justify-end'>{columnsControl}</div>
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

function ColumnsPopover({
  columns,
  table,
}: {
  columns: readonly ColumnId[];
  table: ReturnType<typeof useReactTable<BundleRow>>;
}) {
  return (
    <Popover.Root>
      <Popover.Trigger
        className='inline-flex h-9 items-center gap-2 rounded-md border border-input bg-transparent px-3 text-sm font-medium text-foreground transition-colors hover:border-primary/60 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'
        data-testid='columns-popover-trigger'
      >
        <Columns3 aria-hidden='true' />
        <span>Columns</span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner align='end' sideOffset={6}>
          <Popover.Popup
            aria-label='Visible columns'
            className='z-50 flex w-56 flex-col gap-1 rounded-md border border-border bg-popover p-2 text-popover-foreground shadow-md outline-none'
            role='group'
          >
            {columns.map((columnId) => {
              const column = table.getColumn(columnId);
              if (!column) return null;
              const inputId = `column-toggle-${columnId}`;
              return (
                <label
                  className='flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent'
                  htmlFor={inputId}
                  key={columnId}
                >
                  <Checkbox
                    checked={column.getIsVisible()}
                    id={inputId}
                    onChange={(event) => column.toggleVisibility(event.target.checked)}
                  />
                  <span className='capitalize'>{String(column.columnDef.header ?? columnId)}</span>
                </label>
              );
            })}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
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

function facetChipLabel(facet: 'orgs' | 'tags'): string {
  switch (facet) {
    case 'orgs':
      return 'Org';
    case 'tags':
      return 'Tag';
  }
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span
      className='inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-0.5 text-xs text-foreground'
      data-testid={`chip-${label}`}
    >
      <span>{label}</span>
      <button
        aria-label={`Remove ${label}`}
        className='rounded-full p-0.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
        onClick={onRemove}
        type='button'
      >
        <X aria-hidden='true' className='h-3 w-3' />
      </button>
    </span>
  );
}

function loadColumnVisibility(): VisibilityState {
  if (typeof window === 'undefined') return { ...DEFAULT_COLUMN_VISIBILITY };
  try {
    const raw = window.localStorage.getItem(COLUMN_VISIBILITY_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_COLUMN_VISIBILITY };
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ...DEFAULT_COLUMN_VISIBILITY };
    }
    const result: VisibilityState = { ...DEFAULT_COLUMN_VISIBILITY };
    for (const id of ALL_COLUMN_IDS) {
      const value = (parsed as Record<string, unknown>)[id];
      if (typeof value === 'boolean') result[id] = value;
    }
    return result;
  } catch {
    return { ...DEFAULT_COLUMN_VISIBILITY };
  }
}

function loadShowOrgScoped(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const raw = window.localStorage.getItem(SHOW_ORG_SCOPED_STORAGE_KEY);
    if (raw === null) return false;
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'boolean' ? parsed : false;
  } catch {
    return false;
  }
}

function parseSort(value: string): SortingState {
  if (!value) return [];
  const [id, dir] = value.split(':');
  if (!id || (dir !== 'asc' && dir !== 'desc')) return [];
  return [{ desc: dir === 'desc', id }];
}

function serializeSort(state: SortingState): string {
  if (!state.length) return '';
  const [first] = state;
  if (!first) return '';
  return `${first.id}:${first.desc ? 'desc' : 'asc'}`;
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
