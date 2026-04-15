import { forwardRef } from 'react';

import { cn } from '@/lib/utils';

export const Card = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(function Card(
  { className, ...props },
  ref,
) {
  return (
    <div
      className={cn('rounded-xl border border-border bg-card text-card-foreground shadow-sm', className)}
      ref={ref}
      {...props}
    />
  );
});

export const CardHeader = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(function CardHeader(
  { className, ...props },
  ref,
) {
  return <div className={cn('flex flex-col space-y-1.5 p-6', className)} ref={ref} {...props} />;
});

export const CardTitle = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(function CardTitle(
  { className, ...props },
  ref,
) {
  return (
    <div
      className={cn('text-lg font-semibold leading-tight tracking-tight text-foreground', className)}
      ref={ref}
      {...props}
    />
  );
});

export const CardDescription = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  function CardDescription({ className, ...props }, ref) {
    return <div className={cn('text-sm text-muted-foreground', className)} ref={ref} {...props} />;
  },
);

export const CardContent = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(function CardContent(
  { className, ...props },
  ref,
) {
  return <div className={cn('p-6 pt-0', className)} ref={ref} {...props} />;
});

export const CardFooter = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(function CardFooter(
  { className, ...props },
  ref,
) {
  return <div className={cn('flex items-center p-6 pt-0', className)} ref={ref} {...props} />;
});
