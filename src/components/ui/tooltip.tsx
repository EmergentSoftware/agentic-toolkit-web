import { Tooltip as BaseTooltip } from '@base-ui-components/react/tooltip';
import { type ReactNode } from 'react';

export interface TooltipProps {
  align?: 'center' | 'end' | 'start';
  children: ReactNode;
  closeDelay?: number;
  content: ReactNode;
  delay?: number;
  maxWidth?: number | string;
  side?: 'bottom' | 'left' | 'right' | 'top';
  sideOffset?: number;
}

export function Tooltip({
  align = 'center',
  children,
  closeDelay = 100,
  content,
  delay = 300,
  maxWidth = '20rem',
  side = 'top',
  sideOffset = 6,
}: TooltipProps) {
  return (
    <BaseTooltip.Root>
      <BaseTooltip.Trigger
        className='inline-block max-w-full cursor-default outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background'
        closeDelay={closeDelay}
        delay={delay}
        render={<span />}
      >
        {children}
      </BaseTooltip.Trigger>
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner align={align} side={side} sideOffset={sideOffset}>
          <BaseTooltip.Popup
            className='z-50 rounded-md border border-border bg-popover px-3 py-2 text-xs leading-snug text-popover-foreground shadow-md outline-none'
            style={{ maxWidth }}
          >
            {content}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}
