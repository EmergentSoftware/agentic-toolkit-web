import { Toast } from '@base-ui-components/react/toast';
import { QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode } from 'react';
import { Route, Routes } from 'react-router';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AppLayout } from '@/components/layout/AppLayout';
import { ThemeProvider } from '@/components/theme/ThemeProvider';
import { queryClient } from '@/lib/query-client';
import { AssetDetailRoute } from '@/routes/AssetDetail';
import { BrowseRoute } from '@/routes/Browse';
import { BundleDetailRoute } from '@/routes/BundleDetail';
import { ContributeRoute } from '@/routes/Contribute';
import { NotAuthorizedRoute } from '@/routes/NotAuthorized';
import { NotFoundRoute } from '@/routes/NotFound';
import { SignInRoute } from '@/routes/SignIn';

export function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <Toast.Provider>
          <ErrorBoundary scope='application'>
            <Routes>
              <Route element={<AppLayout />} path='/'>
                <Route
                  element={
                    <RouteBoundary scope='Browse'>
                      <BrowseRoute />
                    </RouteBoundary>
                  }
                  index
                />
                <Route
                  element={
                    <RouteBoundary scope='Sign in'>
                      <SignInRoute />
                    </RouteBoundary>
                  }
                  path='sign-in'
                />
                <Route
                  element={
                    <RouteBoundary scope='Asset detail'>
                      <AssetDetailRoute />
                    </RouteBoundary>
                  }
                  path='assets/:assetId'
                />
                <Route
                  element={
                    <RouteBoundary scope='Bundle detail'>
                      <BundleDetailRoute />
                    </RouteBoundary>
                  }
                  path='bundles/:bundleId'
                />
                <Route
                  element={
                    <RouteBoundary scope='Contribute'>
                      <ContributeRoute />
                    </RouteBoundary>
                  }
                  path='contribute'
                />
                <Route
                  element={
                    <RouteBoundary scope='Not authorized'>
                      <NotAuthorizedRoute />
                    </RouteBoundary>
                  }
                  path='not-authorized'
                />
                <Route
                  element={
                    <RouteBoundary scope='Not found'>
                      <NotFoundRoute />
                    </RouteBoundary>
                  }
                  path='*'
                />
              </Route>
            </Routes>
          </ErrorBoundary>
        </Toast.Provider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

function RouteBoundary({ children, scope }: { children: ReactNode; scope: string }) {
  return <ErrorBoundary scope={scope}>{children}</ErrorBoundary>;
}
