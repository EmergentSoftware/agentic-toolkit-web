import { Toast } from '@base-ui-components/react/toast';

import { cn } from '@/lib/utils';

export function Toaster({ className }: { className?: string }) {
  const { toasts } = Toast.useToastManager();

  return (
    <Toast.Portal>
      <Toast.Viewport
        className={cn(
          'fixed bottom-4 right-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2 outline-none',
          className,
        )}
      >
        {toasts.map((toast) => (
          <Toast.Root
            className='group flex items-start gap-3 rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-lg data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 data-[ending-style]:translate-x-4 transition-all duration-200'
            data-testid='toast-root'
            key={toast.id}
            toast={toast}
          >
            <div className='flex flex-1 flex-col gap-1'>
              {toast.title ? (
                <Toast.Title className='text-sm font-medium text-foreground'>{toast.title}</Toast.Title>
              ) : null}
              {toast.description ? (
                <Toast.Description className='text-sm text-muted-foreground'>{toast.description}</Toast.Description>
              ) : null}
            </div>
            <Toast.Close
              aria-label='Dismiss notification'
              className='text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
            >
              ×
            </Toast.Close>
          </Toast.Root>
        ))}
      </Toast.Viewport>
    </Toast.Portal>
  );
}
