import { forwardRef } from 'react';

import { cn } from '@/lib/utils';

export const Checkbox = forwardRef<HTMLInputElement, Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>>(
  function Checkbox({ className, ...props }, ref) {
    return (
      <input
        className={cn(
          'h-4 w-4 shrink-0 cursor-pointer rounded-sm border border-input bg-card accent-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        ref={ref}
        type='checkbox'
        {...props}
      />
    );
  },
);
