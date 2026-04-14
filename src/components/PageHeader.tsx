import { cn } from '@/lib/utils';

interface PageHeaderProps {
  actions?: React.ReactNode;
  className?: string;
  description?: React.ReactNode;
  title: React.ReactNode;
}

export function PageHeader({ actions, className, description, title }: PageHeaderProps) {
  return (
    <header className={cn('flex flex-col gap-2 pb-6 sm:flex-row sm:items-start sm:justify-between', className)}>
      <div className='flex flex-col gap-1'>
        <h1 className='text-2xl font-semibold tracking-tight text-foreground sm:text-3xl'>{title}</h1>
        {description ? <p className='text-sm text-muted-foreground sm:text-base'>{description}</p> : null}
      </div>
      {actions ? <div className='flex shrink-0 items-center gap-2'>{actions}</div> : null}
    </header>
  );
}
