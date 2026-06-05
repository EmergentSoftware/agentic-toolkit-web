import { Popover } from '@base-ui-components/react/popover';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';

import type { DownloadFormat } from '@/lib/download-service';

import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface DownloadMenuProps {
  /**
   * When true, render a dropdown menu offering both `.zip` and `.skill`
   * downloads (skill-type assets). When false, render a single plain Download
   * button that always downloads the full `.zip`.
   */
  enableSkillFormat: boolean;
  isLoading: boolean;
  name: string;
  onDownload: (format: DownloadFormat) => void;
  /**
   * Stop click propagation on the trigger and menu items. Set when rendered
   * inside a clickable row/card so the download interaction does not also
   * navigate.
   */
  stopPropagation?: boolean;
  /** Base test id; menu items derive `${testId}-zip` / `${testId}-skill`. */
  testId: string;
}

const LoadingSpinner = () => (
  <span
    aria-hidden='true'
    className='mr-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent'
  />
);

/**
 * Download control for assets. Skill-type assets get a two-option menu
 * (full `.zip` or metadata-stripped `.skill`); everything else gets the
 * original single-action Download button.
 */
export function DownloadMenu({
  enableSkillFormat,
  isLoading,
  name,
  onDownload,
  stopPropagation,
  testId,
}: DownloadMenuProps) {
  const [open, setOpen] = useState(false);

  if (!enableSkillFormat) {
    return (
      <Button
        aria-busy={isLoading || undefined}
        aria-label={`Download ${name}`}
        data-testid={testId}
        disabled={isLoading}
        onClick={(event) => {
          if (stopPropagation) event.stopPropagation();
          onDownload('zip');
        }}
        size='sm'
        variant='outline'
      >
        {isLoading ? <LoadingSpinner /> : null}
        {isLoading ? 'Downloading…' : 'Download'}
      </Button>
    );
  }

  const select = (format: DownloadFormat) => (event: React.MouseEvent<HTMLButtonElement>) => {
    if (stopPropagation) event.stopPropagation();
    setOpen(false);
    onDownload(format);
  };

  return (
    <Popover.Root onOpenChange={setOpen} open={open}>
      <Popover.Trigger
        aria-busy={isLoading || undefined}
        aria-label={`Download ${name}`}
        className={cn(buttonVariants({ size: 'sm', variant: 'outline' }))}
        data-testid={testId}
        disabled={isLoading}
        onClick={(event) => {
          if (stopPropagation) event.stopPropagation();
        }}
      >
        {isLoading ? <LoadingSpinner /> : null}
        {isLoading ? 'Downloading…' : 'Download'}
        <ChevronDown aria-hidden='true' className='h-3.5 w-3.5 opacity-60' />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner align='end' sideOffset={6}>
          <Popover.Popup
            aria-label='Download options'
            className='z-50 flex w-44 flex-col rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md outline-none'
            role='menu'
          >
            <button
              className='flex items-center rounded-sm px-2 py-1.5 text-left text-xs text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
              data-testid={`${testId}-zip`}
              onClick={select('zip')}
              role='menuitem'
              type='button'
            >
              Download .zip
            </button>
            <button
              className='flex items-center rounded-sm px-2 py-1.5 text-left text-xs text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
              data-testid={`${testId}-skill`}
              onClick={select('skill')}
              role='menuitem'
              type='button'
            >
              Download .skill
            </button>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
