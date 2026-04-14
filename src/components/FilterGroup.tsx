import { Checkbox } from '@/components/ui/checkbox';

interface FilterGroupProps<T extends string> {
  emptyLabel?: string;
  label: string;
  onToggle: (value: T) => void;
  options: T[];
  selected: Set<T>;
}

export function FilterGroup<T extends string>({
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
