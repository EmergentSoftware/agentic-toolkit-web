import { X } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { useSession } from '@/hooks/useSession';
import { formatSunsetDate, SESSION_STORAGE_KEYS } from '@/lib/session';

/**
 * Slim banner under the header while a GitHub session runs and the API has
 * scheduled the end of GitHub sign-in (`githubAuthSunset` on the principal).
 * Never shown for Entra sessions. Dismissal lasts for the tab.
 */
export function SunsetBanner() {
  const { scheme, signIn, user } = useSession();
  const [dismissed, setDismissed] = useState(() => readDismissed());

  const sunset = scheme === 'github' ? user?.githubAuthSunset : undefined;
  if (!sunset || dismissed) return null;

  const dismiss = () => {
    window.sessionStorage.setItem(SESSION_STORAGE_KEYS.sunsetDismissed, '1');
    setDismissed(true);
  };

  return (
    <div className='w-full bg-warning text-warning-foreground' data-testid='sunset-banner' role='status'>
      <div className='mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2 text-sm sm:px-6'>
        <p className='flex-1'>
          GitHub sign-in to ATK ends on {formatSunsetDate(sunset)}. Switch to your Emergent account before then.
        </p>
        <Button data-testid='sunset-switch' onClick={() => signIn('entra')} size='sm' variant='outline'>
          Switch now
        </Button>
        <Button aria-label='Dismiss' data-testid='sunset-dismiss' onClick={dismiss} size='icon' variant='ghost'>
          <X aria-hidden='true' />
        </Button>
      </div>
    </div>
  );
}

function readDismissed(): boolean {
  return window.sessionStorage.getItem(SESSION_STORAGE_KEYS.sunsetDismissed) === '1';
}
