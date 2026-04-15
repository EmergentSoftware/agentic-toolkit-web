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
import { Building2, Columns3, Hash, Wrench, X } from 'lucide-react';
import { parseAsArrayOf, parseAsString, useQueryStates } from 'nuqs';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';

import type { AssetType } from '@/lib/schemas/manifest';
import type { RegistryAsset } from '@/lib/schemas/registry';

import { EmptyState } from '@/components/EmptyState';
import { useFullWidthLayout } from '@/components/layout/LayoutWidthContext';
import { LoadingIndicator } from '@/components/LoadingIndicator';
import { MultiSelectFilter } from '@/components/MultiSelectFilter';
import { PageHeader } from '@/components/PageHeader';
import { assetTypeBadgeVariant, Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip } from '@/components/ui/tooltip';
import { useDownloadAsset } from '@/hooks/useDownloadAsset';
import { useRegistry } from '@/hooks/useRegistry';
import { rankAssetNames } from '@/lib/search';
import { cn } from '@/lib/utils';

interface BrowseRow {
  description: string;
  name: string;
  org: string;
  tags: string[];
  tools: string[];
  type: AssetType;
  version: string;
}

const ASSET_TYPES: AssetType[] = ['skill', 'agent', 'rule', 'hook', 'memory-template', 'mcp-config'];

const ALL_COLUMN_IDS = ['name', 'type', 'description', 'version', 'tags', 'tools', 'org', 'actions'] as const;
type ColumnId = (typeof ALL_COLUMN_IDS)[number];

const COLUMN_VISIBILITY_STORAGE_KEY = 'atk.browse.columnVisibility';
const SHOW_ORG_SCOPED_STORAGE_KEY = 'atk.browse.showOrgScoped';

interface BrowseCardListProps {
  isDownloading: (ref: { name: string; org?: string; type: AssetType; version: string }) => boolean;
  onCardClick: (row: BrowseRow) => void;
  onDownload: (row: BrowseRow) => void;
  rows: BrowseRow[];
}

interface BrowseTableProps {
  columnsControl: React.ReactNode;
  onRowClick: (row: BrowseRow) => void;
  table: ReturnType<typeof useReactTable<BrowseRow>>;
}

export function BrowseRoute() {
  useFullWidthLayout();
  const { data, error, isError, isLoading } = useRegistry();
  const navigate = useNavigate();
  const { download, isDownloading } = useDownloadAsset();

  const [filters, setFilters] = useQueryStates({
    orgs: parseAsArrayOf(parseAsString).withDefault([]),
    q: parseAsString.withDefault(''),
    sort: parseAsString.withDefault(''),
    tags: parseAsArrayOf(parseAsString).withDefault([]),
    tools: parseAsArrayOf(parseAsString).withDefault([]),
    types: parseAsArrayOf(parseAsString).withDefault([]),
  });

  const search = filters.q;
  const typeFilter = useMemo(() => new Set(filters.types as AssetType[]), [filters.types]);
  const tagFilter = useMemo(() => new Set(filters.tags), [filters.tags]);
  const toolFilter = useMemo(() => new Set(filters.tools), [filters.tools]);
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

  const assets = useMemo<RegistryAsset[]>(() => data?.assets ?? [], [data]);

  const { allOrgs, allTags, allTools } = useMemo(() => {
    const tags = new Set<string>();
    const tools = new Set<string>();
    const orgs = new Set<string>();
    for (const asset of assets) {
      asset.tags.forEach((t) => tags.add(t));
      const latest = asset.versions[asset.latest];
      latest?.tools.forEach((t) => tools.add(t));
      if (asset.org) orgs.add(asset.org);
    }
    return {
      allOrgs: [...orgs].sort(),
      allTags: [...tags].sort(),
      allTools: [...tools].sort(),
    };
  }, [assets]);

  const rows = useMemo<BrowseRow[]>(() => {
    const filtered = assets.filter((asset) => {
      if (!showOrgScoped && orgFilter.size === 0 && asset.org) return false;
      if (typeFilter.size > 0 && !typeFilter.has(asset.type)) return false;
      if (tagFilter.size > 0 && !asset.tags.some((t) => tagFilter.has(t))) return false;
      const latest = asset.versions[asset.latest];
      if (toolFilter.size > 0 && !(latest?.tools ?? []).some((t) => toolFilter.has(t))) return false;
      if (orgFilter.size > 0 && !(asset.org && orgFilter.has(asset.org))) return false;
      return true;
    });

    const trimmed = search.trim();
    let ordered: RegistryAsset[];
    if (trimmed) {
      const ranked = rankAssetNames(filtered, trimmed);
      const byName = new Map(filtered.map((a) => [a.name, a]));
      ordered = ranked.map((name) => byName.get(name)!).filter(Boolean);
    } else {
      ordered = [...filtered].sort((a, b) => a.name.localeCompare(b.name));
    }

    return ordered.map(toRow);
  }, [assets, typeFilter, tagFilter, toolFilter, orgFilter, search, showOrgScoped]);

  const columns = useMemo<ColumnDef<BrowseRow>[]>(
    () => [
      {
        accessorKey: 'name',
        cell: ({ row }) => <span className='font-medium text-foreground'>{row.original.name}</span>,
        header: 'Name',
      },
      {
        accessorKey: 'type',
        cell: ({ row }) => (
          <Badge variant={assetTypeBadgeVariant(row.original.type)}>{row.original.type}</Badge>
        ),
        header: 'Type',
      },
      {
        accessorKey: 'description',
        cell: ({ row }) => (
          <Tooltip content={row.original.description} maxWidth='28rem'>
            <span className='line-clamp-2 text-muted-foreground'>{row.original.description}</span>
          </Tooltip>
        ),
        header: 'Description',
      },
      {
        accessorKey: 'version',
        cell: ({ row }) => <span className='text-muted-foreground'>{row.original.version}</span>,
        header: 'Version',
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
        accessorKey: 'tools',
        cell: ({ row }) => (
          <div className='flex flex-wrap gap-1'>
            {row.original.tools.map((tool) => (
              <Badge key={tool} variant='tool'>
                <Wrench aria-hidden='true' className='h-3 w-3 opacity-70' />
                {tool}
              </Badge>
            ))}
          </div>
        ),
        enableSorting: false,
        header: 'Tools',
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
        cell: ({ row }) => {
          const assetRef = rowToAssetRef(row.original);
          const loading = isDownloading(assetRef);
          return (
            <DownloadRowButton
              isLoading={loading}
              name={row.original.name}
              onClick={(event) => {
                event.stopPropagation();
                void download(assetRef);
              }}
            />
          );
        },
        enableSorting: false,
        header: 'Actions',
        id: 'actions',
      },
    ],
    [download, isDownloading],
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

  const navigateToAsset = (row: BrowseRow) => {
    const query = row.org ? `?org=${encodeURIComponent(row.org)}` : '';
    navigate(`/assets/${row.type}/${encodeURIComponent(row.name)}/${row.version}${query}`);
  };

  const setSearch = (value: string) => void setFilters({ q: value });
  const setTypeFilter = (next: Set<string>) => void setFilters({ types: [...next] });
  const setTagFilter = (next: Set<string>) => void setFilters({ tags: [...next] });
  const setToolFilter = (next: Set<string>) => void setFilters({ tools: [...next] });
  const setOrgFilter = (next: Set<string>) => void setFilters({ orgs: [...next] });

  const clearAll = () => {
    void setFilters({ orgs: [], q: '', tags: [], tools: [], types: [] });
  };

  const removeChip = (facet: 'orgs' | 'tags' | 'tools' | 'types', value: string) => {
    const current = filters[facet];
    void setFilters({ [facet]: current.filter((v) => v !== value) });
  };

  const chips = useMemo<Array<{ facet: 'orgs' | 'tags' | 'tools' | 'types'; value: string }>>(() => {
    const items: Array<{ facet: 'orgs' | 'tags' | 'tools' | 'types'; value: string }> = [];
    for (const v of filters.types) items.push({ facet: 'types', value: v });
    for (const v of filters.tags) items.push({ facet: 'tags', value: v });
    for (const v of filters.tools) items.push({ facet: 'tools', value: v });
    for (const v of filters.orgs) items.push({ facet: 'orgs', value: v });
    return items;
  }, [filters]);

  const hasActiveFilters = chips.length > 0 || search.trim() !== '';

  const columnsControl = <ColumnsPopover columns={ALL_COLUMN_IDS} table={table} />;

  return (
    <>
      <PageHeader
        description='Search and filter vetted skills, agents, rules, hooks, and memory templates from the registry.'
        title='Browse assets'
      />

      <section aria-label='Asset filters' className='mb-6 flex flex-col gap-3'>
        <div className='flex flex-col gap-2 md:flex-row md:items-center'>
          <label className='flex-1' htmlFor='browse-search'>
            <span className='sr-only'>Search assets</span>
            <Input
              autoComplete='off'
              id='browse-search'
              onChange={(event) => setSearch(event.target.value)}
              placeholder='Search assets by name, description, tag, org, or author…'
              type='search'
              value={search}
            />
          </label>
        </div>

        <div className='flex flex-wrap items-center gap-2'>
          <MultiSelectFilter
            data-testid='filter-types'
            label='Asset type'
            onChange={setTypeFilter}
            options={ASSET_TYPES}
            selected={typeFilter as Set<string>}
          />
          <MultiSelectFilter
            data-testid='filter-tags'
            emptyLabel='No tags available'
            label='Tags'
            onChange={setTagFilter}
            options={allTags}
            selected={tagFilter}
          />
          <MultiSelectFilter
            data-testid='filter-tools'
            emptyLabel='No tools available'
            label='Tool compatibility'
            onChange={setToolFilter}
            options={allTools}
            selected={toolFilter}
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
            <span>Show org-scoped assets</span>
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
          data-testid='browse-error'
          role='alert'
        >
          <p className='font-medium text-foreground'>Failed to load the registry.</p>
          <p className='text-muted-foreground'>{error?.message ?? 'Unknown error.'}</p>
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          description={
            hasActiveFilters
              ? 'No assets match the active filters. Try clearing a filter or adjusting your search.'
              : 'The registry is empty.'
          }
          title='No matching assets'
        />
      ) : (
        <>
          <BrowseTable columnsControl={columnsControl} onRowClick={navigateToAsset} table={table} />
          <BrowseCardList
            isDownloading={isDownloading}
            onCardClick={navigateToAsset}
            onDownload={(row) => void download(rowToAssetRef(row))}
            rows={rows}
          />
        </>
      )}
    </>
  );
}

function BrowseCardList({ isDownloading, onCardClick, onDownload, rows }: BrowseCardListProps) {
  return (
    <ul
      aria-label='Registry assets (compact)'
      className='flex flex-col gap-3 md:hidden'
      data-testid='browse-card-list'
    >
      {rows.map((row) => (
        <li key={row.name}>
          <Card
            className='cursor-pointer'
            data-testid={`browse-card-${row.name}`}
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
                <Badge variant={assetTypeBadgeVariant(row.type)}>{row.type}</Badge>
              </div>
              <Tooltip content={row.description} maxWidth='22rem'>
                <CardDescription className='line-clamp-2'>{row.description}</CardDescription>
              </Tooltip>
            </CardHeader>
            <CardContent className='flex flex-col gap-3 text-sm'>
              <div className='flex flex-wrap items-center gap-2 text-muted-foreground'>
                <span>v{row.version}</span>
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
              {row.tools.length > 0 ? (
                <div className='flex flex-wrap gap-1'>
                  {row.tools.map((tool) => (
                    <Badge key={tool} variant='tool'>
                      <Wrench aria-hidden='true' className='h-3 w-3 opacity-70' />
                      {tool}
                    </Badge>
                  ))}
                </div>
              ) : null}
              <DownloadRowButton
                isLoading={isDownloading(rowToAssetRef(row))}
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

function BrowseTable({ columnsControl, onRowClick, table }: BrowseTableProps) {
  return (
    <div className='hidden md:block' data-testid='browse-table-wrapper'>
      <div className='mb-2 flex justify-end'>{columnsControl}</div>
      <Table aria-label='Registry assets'>
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
              data-testid={`browse-row-${row.original.name}`}
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
  table: ReturnType<typeof useReactTable<BrowseRow>>;
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

function DownloadRowButton({
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
      data-testid={`browse-download-${name}`}
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

function facetChipLabel(facet: 'orgs' | 'tags' | 'tools' | 'types'): string {
  switch (facet) {
    case 'orgs':
      return 'Org';
    case 'tags':
      return 'Tag';
    case 'tools':
      return 'Tool';
    case 'types':
      return 'Type';
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

const DEFAULT_COLUMN_VISIBILITY: VisibilityState = { tools: false };

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

function rowToAssetRef(row: BrowseRow): { name: string; org?: string; type: AssetType; version: string } {
  return {
    name: row.name,
    org: row.org || undefined,
    type: row.type,
    version: row.version,
  };
}

function serializeSort(state: SortingState): string {
  if (!state.length) return '';
  const [first] = state;
  if (!first) return '';
  return `${first.id}:${first.desc ? 'desc' : 'asc'}`;
}

function toRow(asset: RegistryAsset): BrowseRow {
  const latest = asset.versions[asset.latest];
  return {
    description: latest?.description ?? '',
    name: asset.name,
    org: asset.org ?? '',
    tags: asset.tags,
    tools: latest?.tools ?? [],
    type: asset.type,
    version: asset.latest,
  };
}

export default BrowseRoute;
