import { Outlet } from 'react-router';

import { Toaster } from '@/components/Toaster';
import { cn } from '@/lib/utils';

import { Header } from './Header';
import { LayoutWidthProvider, useLayoutWidth } from './LayoutWidthContext';

export function AppLayout() {
  return (
    <LayoutWidthProvider>
      <AppLayoutInner />
    </LayoutWidthProvider>
  );
}

function AppLayoutInner() {
  const { width } = useLayoutWidth();
  return (
    <div className='flex min-h-full flex-col bg-background text-foreground' data-testid='app-layout'>
      <Header />
      <main
        className={cn(
          'flex w-full flex-1 flex-col py-8',
          width === 'full' ? 'px-6 lg:px-8' : 'mx-auto max-w-6xl px-4 sm:px-6',
        )}
        data-testid='app-main'
      >
        <Outlet />
      </main>
      <Toaster />
    </div>
  );
}
