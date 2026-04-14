import { Loader2 } from 'lucide-react';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface LoadingIndicatorProps {
  className?: string;
  label?: string;
  variant?: 'skeleton' | 'spinner';
}

export function LoadingIndicator({ className, label = 'Loading…', variant = 'spinner' }: LoadingIndicatorProps) {
  if (variant === 'skeleton') {
    return (
      <div aria-busy='true' aria-label={label} className={cn('flex flex-col gap-3', className)} role='status'>
        <Skeleton className='h-4 w-1/3' />
        <Skeleton className='h-4 w-2/3' />
        <Skeleton className='h-4 w-1/2' />
      </div>
    );
  }

  return (
    <div
      aria-busy='true'
      aria-label={label}
      className={cn('flex items-center gap-2 text-sm text-muted-foreground', className)}
      role='status'
    >
      <Loader2 aria-hidden='true' className='size-4 animate-spin' />
      <span>{label}</span>
    </div>
  );
}
