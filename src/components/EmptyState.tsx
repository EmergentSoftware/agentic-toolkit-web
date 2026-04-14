import { Inbox } from 'lucide-react';

import { cn } from '@/lib/utils';

interface EmptyStateProps {
  actions?: React.ReactNode;
  className?: string;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  title: React.ReactNode;
}

export function EmptyState({ actions, className, description, icon, title }: EmptyStateProps) {
  return (
    <div
      aria-live='polite'
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card/50 p-10 text-center',
        className,
      )}
      data-testid='empty-state'
      role='status'
    >
      <div aria-hidden='true' className='text-muted-foreground [&_svg]:size-8'>
        {icon ?? <Inbox />}
      </div>
      <div className='flex flex-col gap-1'>
        <p className='text-base font-medium text-foreground'>{title}</p>
        {description ? <p className='text-sm text-muted-foreground'>{description}</p> : null}
      </div>
      {actions ? <div className='flex items-center gap-2'>{actions}</div> : null}
    </div>
  );
}
