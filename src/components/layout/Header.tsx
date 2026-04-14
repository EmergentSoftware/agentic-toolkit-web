import { Package } from 'lucide-react';
import { NavLink } from 'react-router';

import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface NavItem {
  end?: boolean;
  label: string;
  to: string;
}

const NAV_ITEMS: NavItem[] = [
  { end: true, label: 'Browse', to: '/' },
  { label: 'Contribute', to: '/contribute' },
];

export function Header() {
  return (
    <header
      className='sticky top-0 z-40 flex h-14 w-full items-center border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80'
      data-testid='app-header'
    >
      <div className='mx-auto flex w-full max-w-6xl items-center gap-6 px-4 sm:px-6'>
        <NavLink className='flex items-center gap-2 font-semibold tracking-tight text-foreground' end to='/'>
          <Package aria-hidden='true' className='size-5 text-primary' />
          <span>Agentic Toolkit</span>
        </NavLink>

        <nav aria-label='Primary' className='flex flex-1 items-center gap-1'>
          {NAV_ITEMS.map((item) => (
            <NavLink
              className={({ isActive }) =>
                cn(
                  'rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground',
                  isActive && 'bg-accent text-accent-foreground',
                )
              }
              end={item.end}
              key={item.to}
              to={item.to}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className='flex items-center gap-2'>
          <ThemeToggle />
          <Button aria-label='Sign in' data-testid='user-affordance' disabled size='sm' variant='outline'>
            Sign in
          </Button>
        </div>
      </div>
    </header>
  );
}
