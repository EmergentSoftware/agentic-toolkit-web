import { Outlet } from 'react-router';

import { Toaster } from '@/components/Toaster';

import { Footer } from './Footer';
import { Header } from './Header';

export function AppLayout() {
  return (
    <div className='flex min-h-full flex-col bg-background text-foreground' data-testid='app-layout'>
      <Header />
      <main className='mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-8 sm:px-6' data-testid='app-main'>
        <Outlet />
      </main>
      <Footer />
      <Toaster />
    </div>
  );
}
