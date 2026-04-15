import { Popover } from '@base-ui-components/react/popover';
import { ChevronDown } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface MultiSelectFilterProps {
  'data-testid'?: string;
  emptyLabel?: string;
  label: string;
  onChange: (selected: Set<string>) => void;
  options: string[];
  searchPlaceholder?: string;
  selected: Set<string>;
}

export function MultiSelectFilter({
  'data-testid': testId,
  emptyLabel = 'No options',
  label,
  onChange,
  options,
  searchPlaceholder,
  selected,
}: MultiSelectFilterProps) {
  const [query, setQuery] = useState('');
  const count = selected.size;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((option) => option.toLowerCase().includes(q));
  }, [options, query]);

  const toggle = (value: string) => {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next);
  };

  const selectAll = () => {
    const next = new Set(selected);
    for (const option of filtered) next.add(option);
    onChange(next);
  };

  const clear = () => {
    if (!filtered.length) {
      onChange(new Set());
      return;
    }
    const next = new Set(selected);
    for (const option of filtered) next.delete(option);
    onChange(next);
  };

  const groupId = `multi-${label.toLowerCase().replace(/\s+/g, '-')}`;

  return (
    <Popover.Root>
      <Popover.Trigger
        className={cn(
          'inline-flex h-9 items-center gap-2 rounded-md border border-input bg-transparent px-3 text-sm font-medium text-foreground transition-colors hover:border-primary/60 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          count > 0 && 'border-primary/60',
        )}
        data-testid={testId}
      >
        <span>{label}</span>
        {count > 0 ? (
          <Badge data-testid={testId ? `${testId}-count` : undefined} variant='secondary'>
            {count}
          </Badge>
        ) : null}
        <ChevronDown aria-hidden='true' className='opacity-60' />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner align='start' sideOffset={6}>
          <Popover.Popup
            aria-label={label}
            className='z-50 flex w-72 flex-col gap-2 rounded-md border border-border bg-popover p-3 text-popover-foreground shadow-md outline-none'
            role='group'
          >
            <div className='flex items-center justify-between'>
              <span className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>
                {label}
              </span>
              <div className='flex items-center gap-1'>
                <Button
                  disabled={filtered.length === 0}
                  onClick={selectAll}
                  size='sm'
                  type='button'
                  variant='ghost'
                >
                  Select all
                </Button>
                <Button
                  disabled={count === 0}
                  onClick={clear}
                  size='sm'
                  type='button'
                  variant='ghost'
                >
                  Clear
                </Button>
              </div>
            </div>
            <Input
              aria-label={`Search ${label}`}
              autoComplete='off'
              data-testid={testId ? `${testId}-search` : undefined}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={searchPlaceholder ?? `Search ${label.toLowerCase()}…`}
              type='search'
              value={query}
            />
            {filtered.length === 0 ? (
              <p className='py-2 text-sm text-muted-foreground'>{emptyLabel}</p>
            ) : (
              <ul
                aria-labelledby={`${groupId}-label`}
                className='max-h-64 overflow-y-auto pr-1'
                role='list'
              >
                {filtered.map((option) => {
                  const inputId = `${groupId}-${option}`;
                  return (
                    <li key={option}>
                      <label
                        className='flex cursor-pointer items-center gap-2 rounded-sm px-1 py-1.5 text-sm hover:bg-accent'
                        htmlFor={inputId}
                      >
                        <Checkbox
                          checked={selected.has(option)}
                          id={inputId}
                          onChange={() => toggle(option)}
                        />
                        <span className='truncate'>{option}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
