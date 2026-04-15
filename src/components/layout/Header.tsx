import { NavLink, useNavigate } from 'react-router';

import { useTheme } from '@/components/theme/ThemeProvider';
import { ThemeToggle } from '@/components/theme/ThemeToggle';
import { Button } from '@/components/ui/button';
import { useSession } from '@/hooks/useSession';
import { consumePendingReturnPath } from '@/lib/session';
import { cn } from '@/lib/utils';

interface NavItem {
  end?: boolean;
  label: string;
  to: string;
}

const NAV_ITEMS: NavItem[] = [
  { end: true, label: 'Browse', to: '/' },
  { label: 'Bundles', to: '/bundles' },
  { label: 'Contribute', to: '/contribute' },
];

export function Header() {
  const { signIn, signOut, status, user } = useSession();
  const navigate = useNavigate();
  const { resolvedTheme } = useTheme();

  const handleSignOut = () => {
    signOut();
    navigate('/', { replace: true });
  };

  const showSignOut = status === 'member' || status === 'non-member' || status === 'verifying';
  const showSignIn = status === 'signed-out';

  const wordmark = resolvedTheme === 'dark' ? '/logo-white-text.svg' : '/logo-dark-text.svg';

  return (
    <header
      className='sticky top-0 z-40 flex h-16 w-full items-center border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80'
      data-testid='app-header'
    >
      <div className='mx-auto flex w-full max-w-6xl items-center gap-6 px-4 sm:px-6'>
        <NavLink
          aria-label='Agentic Toolkit home'
          className='flex items-center gap-2 tracking-tight text-foreground'
          end
          to='/'
        >
          <img
            alt=''
            aria-hidden='true'
            className='h-8 w-8 shrink-0'
            src='/logomark.svg'
          />
          <img alt='Agentic Toolkit' className='h-5 w-auto' src={wordmark} />
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
          {showSignIn ? (
            <Button
              aria-label='Sign in'
              data-testid='user-affordance'
              onClick={() => signIn(consumePendingReturnPath())}
              size='sm'
              variant='outline'
            >
              Sign in
            </Button>
          ) : null}
          {showSignOut ? (
            <>
              {user ? (
                <span
                  className='hidden text-sm text-muted-foreground sm:inline'
                  data-testid='user-login'
                >
                  {user.login}
                </span>
              ) : null}
              <Button
                aria-label='Sign out'
                data-testid='user-affordance'
                onClick={handleSignOut}
                size='sm'
                variant='outline'
              >
                Sign out
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </header>
  );
}
