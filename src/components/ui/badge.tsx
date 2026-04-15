import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center gap-1 border px-2 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    defaultVariants: {
      shape: 'square',
      variant: 'default',
    },
    variants: {
      shape: {
        pill: 'rounded-full',
        square: 'rounded-sm',
      },
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        info: 'border-transparent bg-info text-info-foreground',
        org: 'border-transparent bg-accent text-accent-foreground ring-1 ring-inset ring-primary/25',
        outline: 'border-border text-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        success: 'border-transparent bg-success text-success-foreground',

        // Category-specific treatments so tag/tool/org pills don't look alike.
        tag: 'border-border bg-card text-foreground',
        tool: 'border-transparent bg-muted text-muted-foreground',
        'type-agent': 'border-transparent bg-type-agent text-type-agent-foreground',
        'type-hook': 'border-transparent bg-type-hook text-type-hook-foreground',
        'type-mcp-config': 'border-transparent bg-type-mcp text-type-mcp-foreground',
        'type-memory-template':
          'border-transparent bg-type-memory text-type-memory-foreground',

        'type-rule': 'border-transparent bg-type-rule text-type-rule-foreground',
        // Asset-type variants — each has a distinct hue for fast row scanning.
        'type-skill': 'border-transparent bg-type-skill text-type-skill-foreground',
        warning: 'border-transparent bg-warning text-warning-foreground',
      },
    },
  },
);

export type AssetTypeVariant =
  | 'type-agent'
  | 'type-hook'
  | 'type-mcp-config'
  | 'type-memory-template'
  | 'type-rule'
  | 'type-skill';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function assetTypeBadgeVariant(type: string): AssetTypeVariant {
  switch (type) {
    case 'agent':
      return 'type-agent';
    case 'hook':
      return 'type-hook';
    case 'mcp-config':
      return 'type-mcp-config';
    case 'memory-template':
      return 'type-memory-template';
    case 'rule':
      return 'type-rule';
    case 'skill':
    default:
      return 'type-skill';
  }
}

export function Badge({ className, shape, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ className, shape, variant }))} {...props} />;
}

export { badgeVariants };
