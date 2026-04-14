import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
  type VisibilityState,
} from '@tanstack/react-table';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';

import type { AssetType } from '@/lib/schemas/manifest';
import type { RegistryAsset } from '@/lib/schemas/registry';

import { EmptyState } from '@/components/EmptyState';
import { LoadingIndicator } from '@/components/LoadingIndicator';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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

interface BrowseCardListProps {
  onCardClick: (name: string) => void;
  rows: BrowseRow[];
}

interface BrowseTableProps {
  onRowClick: (name: string) => void;
  table: ReturnType<typeof useReactTable<BrowseRow>>;
}

interface FilterGroupProps<T extends string> {
  emptyLabel?: string;
  label: string;
  onToggle: (value: T) => void;
  options: T[];
  selected: Set<T>;
}

export function BrowseRoute() {
  const { data, error, isError, isLoading } = useRegistry();
  const navigate = useNavigate();

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<Set<AssetType>>(new Set());
  const [tagFilter, setTagFilter] = useState<Set<string>>(new Set());
  const [toolFilter, setToolFilter] = useState<Set<string>>(new Set());
  const [orgOnly, setOrgOnly] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});

  const assets = useMemo<RegistryAsset[]>(() => data?.assets ?? [], [data]);

  const { allTags, allTools } = useMemo(() => {
    const tags = new Set<string>();
    const tools = new Set<string>();
    for (const asset of assets) {
      asset.tags.forEach((t) => tags.add(t));
      const latest = asset.versions[asset.latest];
      latest?.tools.forEach((t) => tools.add(t));
    }
    return { allTags: [...tags].sort(), allTools: [...tools].sort() };
  }, [assets]);

  const rows = useMemo<BrowseRow[]>(() => {
    const filtered = assets.filter((asset) => {
      if (typeFilter.size > 0 && !typeFilter.has(asset.type)) return false;
      if (tagFilter.size > 0 && !asset.tags.some((t) => tagFilter.has(t))) return false;
      const latest = asset.versions[asset.latest];
      if (toolFilter.size > 0 && !(latest?.tools ?? []).some((t) => toolFilter.has(t))) return false;
      if (orgOnly && !asset.org) return false;
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
  }, [assets, typeFilter, tagFilter, toolFilter, orgOnly, search]);

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
          <Badge variant='secondary'>{row.original.type}</Badge>
        ),
        header: 'Type',
      },
      {
        accessorKey: 'description',
        cell: ({ row }) => (
          <span className='line-clamp-2 text-muted-foreground'>{row.original.description}</span>
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
        accessorKey: 'tools',
        cell: ({ row }) => (
          <div className='flex flex-wrap gap-1'>
            {row.original.tools.map((tool) => (
              <Badge key={tool} variant='outline'>
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
            <Badge variant='secondary'>{row.original.org}</Badge>
          ) : (
            <span className='text-xs text-muted-foreground'>global</span>
          ),
        header: 'Org scope',
      },
      {
        cell: ({ row }) => (
          <Button
            aria-label={`Download ${row.original.name}`}
            onClick={(event) => {
              event.stopPropagation();
            }}
            size='sm'
            variant='outline'
          >
            Download
          </Button>
        ),
        enableSorting: false,
        header: 'Actions',
        id: 'actions',
      },
    ],
    [],
  );

  const table = useReactTable({
    columns,
    data: rows,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onSortingChange: setSorting,
    state: { columnVisibility, sorting },
  });

  const navigateToAsset = (name: string) => navigate(`/assets/${encodeURIComponent(name)}`);

  const toggleInSet = <T,>(set: Set<T>, value: T, setSet: (s: Set<T>) => void) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    setSet(next);
  };

  const clearAll = () => {
    setSearch('');
    setTypeFilter(new Set());
    setTagFilter(new Set());
    setToolFilter(new Set());
    setOrgOnly(false);
  };

  const hasActiveFilters =
    search.trim() !== '' ||
    typeFilter.size > 0 ||
    tagFilter.size > 0 ||
    toolFilter.size > 0 ||
    orgOnly;

  return (
    <>
      <PageHeader
        description='Search and filter vetted skills, agents, rules, hooks, and memory templates from the registry.'
        title='Browse assets'
      />

      <section aria-label='Asset filters' className='mb-6 flex flex-col gap-4'>
        <div className='flex flex-col gap-2 md:flex-row md:items-center'>
          <label className='flex-1' htmlFor='browse-search'>
            <span className='sr-only'>Search assets</span>
            <Input
              autoComplete='off'
              id='browse-search'
              onChange={(event) => setSearch(event.target.value)}
              placeholder='Search assets by name, description, tag, or author…'
              type='search'
              value={search}
            />
          </label>
          <div className='flex items-center gap-2'>
            <label
              className='flex cursor-pointer items-center gap-2 text-sm text-foreground'
              htmlFor='browse-org-toggle'
            >
              <Checkbox
                checked={orgOnly}
                id='browse-org-toggle'
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

        <div className='grid gap-4 md:grid-cols-3'>
          <FilterGroup
            label='Asset type'
            onToggle={(value) => toggleInSet(typeFilter, value as AssetType, setTypeFilter)}
            options={ASSET_TYPES}
            selected={typeFilter}
          />
          <FilterGroup
            emptyLabel='No tags available'
            label='Tags'
            onToggle={(value) => toggleInSet(tagFilter, value, setTagFilter)}
            options={allTags}
            selected={tagFilter}
          />
          <FilterGroup
            emptyLabel='No tools available'
            label='Tool compatibility'
            onToggle={(value) => toggleInSet(toolFilter, value, setToolFilter)}
            options={allTools}
            selected={toolFilter}
          />
        </div>

        <fieldset
          aria-label='Column visibility'
          className='flex flex-wrap items-center gap-3 rounded-md border border-border p-3'
        >
          <legend className='sr-only'>Column visibility</legend>
          <span className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>
            Visible columns
          </span>
          {ALL_COLUMN_IDS.map((columnId) => {
            const column = table.getColumn(columnId);
            if (!column) return null;
            const checkboxId = `column-toggle-${columnId}`;
            return (
              <label
                className='flex cursor-pointer items-center gap-2 text-sm text-foreground'
                htmlFor={checkboxId}
                key={columnId}
              >
                <Checkbox
                  checked={column.getIsVisible()}
                  id={checkboxId}
                  onChange={(event) => column.toggleVisibility(event.target.checked)}
                />
                {String(column.columnDef.header ?? columnId)}
              </label>
            );
          })}
        </fieldset>
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
          <BrowseTable onRowClick={navigateToAsset} table={table} />
          <BrowseCardList onCardClick={navigateToAsset} rows={rows} />
        </>
      )}
    </>
  );
}

function BrowseCardList({ onCardClick, rows }: BrowseCardListProps) {
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
            onClick={() => onCardClick(row.name)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onCardClick(row.name);
              }
            }}
            role='link'
            tabIndex={0}
          >
            <CardHeader>
              <div className='flex items-start justify-between gap-2'>
                <CardTitle>{row.name}</CardTitle>
                <Badge variant='secondary'>{row.type}</Badge>
              </div>
              <CardDescription>{row.description}</CardDescription>
            </CardHeader>
            <CardContent className='flex flex-col gap-3 text-sm'>
              <div className='flex items-center gap-2 text-muted-foreground'>
                <span>v{row.version}</span>
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
              {row.tools.length > 0 ? (
                <div className='flex flex-wrap gap-1'>
                  {row.tools.map((tool) => (
                    <Badge key={tool} variant='outline'>
                      {tool}
                    </Badge>
                  ))}
                </div>
              ) : null}
              <Button
                aria-label={`Download ${row.name}`}
                onClick={(event) => event.stopPropagation()}
                size='sm'
                variant='outline'
              >
                Download
              </Button>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}

function BrowseTable({ onRowClick, table }: BrowseTableProps) {
  return (
    <div className='hidden md:block' data-testid='browse-table-wrapper'>
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
              onClick={() => onRowClick(row.original.name)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  onRowClick(row.original.name);
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

function FilterGroup<T extends string>({
  emptyLabel = 'No options',
  label,
  onToggle,
  options,
  selected,
}: FilterGroupProps<T>) {
  const groupId = `filter-${label.toLowerCase().replace(/\s+/g, '-')}`;
  return (
    <fieldset aria-labelledby={`${groupId}-legend`} className='rounded-md border border-border p-3'>
      <legend className='px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground' id={`${groupId}-legend`}>
        {label}
      </legend>
      {options.length === 0 ? (
        <p className='text-sm text-muted-foreground'>{emptyLabel}</p>
      ) : (
        <div className='flex flex-wrap gap-x-4 gap-y-2'>
          {options.map((option) => {
            const inputId = `${groupId}-${option}`;
            return (
              <label className='flex cursor-pointer items-center gap-2 text-sm' htmlFor={inputId} key={option}>
                <Checkbox
                  checked={selected.has(option)}
                  id={inputId}
                  onChange={() => onToggle(option)}
                />
                {option}
              </label>
            );
          })}
        </div>
      )}
    </fieldset>
  );
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
