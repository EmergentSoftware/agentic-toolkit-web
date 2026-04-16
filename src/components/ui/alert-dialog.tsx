import { AlertDialog as BaseAlertDialog } from '@base-ui-components/react/alert-dialog';
import { type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ConfirmDialogProps {
  cancelLabel?: string;
  confirmLabel?: string;
  confirmVariant?: 'default' | 'destructive';
  description: ReactNode;
  onCancel?: () => void;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  testId?: string;
  title: ReactNode;
}

export function ConfirmDialog({
  cancelLabel = 'Cancel',
  confirmLabel = 'Confirm',
  confirmVariant = 'destructive',
  description,
  onCancel,
  onConfirm,
  onOpenChange,
  open,
  testId = 'confirm-dialog',
  title,
}: ConfirmDialogProps) {
  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  const handleConfirm = () => {
    onConfirm();
    onOpenChange(false);
  };

  return (
    <BaseAlertDialog.Root onOpenChange={onOpenChange} open={open}>
      <BaseAlertDialog.Portal>
        <BaseAlertDialog.Backdrop
          className={cn(
            'fixed inset-0 z-40 bg-black/60 transition-opacity duration-200',
            'data-[starting-style]:opacity-0 data-[ending-style]:opacity-0',
          )}
        />
        <BaseAlertDialog.Popup
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2',
            'rounded-lg border border-border bg-popover p-6 text-popover-foreground shadow-xl outline-none',
            'transition-all duration-200',
            'data-[starting-style]:opacity-0 data-[starting-style]:scale-95',
            'data-[ending-style]:opacity-0 data-[ending-style]:scale-95',
          )}
          data-testid={testId}
        >
          <BaseAlertDialog.Title className='text-lg font-semibold leading-tight text-foreground'>
            {title}
          </BaseAlertDialog.Title>
          <BaseAlertDialog.Description className='pt-2 text-sm text-muted-foreground'>
            {description}
          </BaseAlertDialog.Description>
          <div className='flex justify-end gap-2 pt-5'>
            <Button
              data-testid={`${testId}-cancel`}
              onClick={handleCancel}
              type='button'
              variant='outline'
            >
              {cancelLabel}
            </Button>
            <Button
              data-testid={`${testId}-confirm`}
              onClick={handleConfirm}
              type='button'
              variant={confirmVariant}
            >
              {confirmLabel}
            </Button>
          </div>
        </BaseAlertDialog.Popup>
      </BaseAlertDialog.Portal>
    </BaseAlertDialog.Root>
  );
}
