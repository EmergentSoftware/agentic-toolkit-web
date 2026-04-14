import { cn } from '@/lib/utils';

interface SectionHeaderProps {
  actions?: React.ReactNode;
  className?: string;
  description?: React.ReactNode;
  title: React.ReactNode;
}

export function SectionHeader({ actions, className, description, title }: SectionHeaderProps) {
  return (
    <div className={cn('flex flex-col gap-1 pb-3 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className='flex flex-col gap-1'>
        <h2 className='text-lg font-semibold tracking-tight text-foreground'>{title}</h2>
        {description ? <p className='text-sm text-muted-foreground'>{description}</p> : null}
      </div>
      {actions ? <div className='flex shrink-0 items-center gap-2'>{actions}</div> : null}
    </div>
  );
}
