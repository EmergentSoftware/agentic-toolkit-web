import { forwardRef } from 'react';

import { cn } from '@/lib/utils';

export const Table = forwardRef<HTMLTableElement, React.TableHTMLAttributes<HTMLTableElement>>(function Table(
  { className, ...props },
  ref,
) {
  return (
    <div className='relative w-full overflow-auto rounded-xl border border-border'>
      <table className={cn('w-full caption-bottom text-sm', className)} ref={ref} {...props} />
    </div>
  );
});

export const TableHeader = forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  function TableHeader({ className, ...props }, ref) {
    return <thead className={cn('[&_tr]:border-b [&_tr]:border-border', className)} ref={ref} {...props} />;
  },
);

export const TableBody = forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  function TableBody({ className, ...props }, ref) {
    return <tbody className={cn('[&_tr:last-child]:border-0', className)} ref={ref} {...props} />;
  },
);

export const TableRow = forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(function TableRow(
  { className, ...props },
  ref,
) {
  return (
    <tr
      className={cn(
        'border-b border-border transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted',
        className,
      )}
      ref={ref}
      {...props}
    />
  );
});

export const TableHead = forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  function TableHead({ className, ...props }, ref) {
    return (
      <th
        className={cn(
          'h-10 px-3 text-left align-middle text-xs font-medium uppercase tracking-wide text-muted-foreground',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);

export const TableCell = forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  function TableCell({ className, ...props }, ref) {
    return <td className={cn('px-3 py-3 align-middle', className)} ref={ref} {...props} />;
  },
);
