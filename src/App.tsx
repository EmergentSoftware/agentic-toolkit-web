import { Toast } from '@base-ui-components/react/toast';
import { QueryClientProvider } from '@tanstack/react-query';
import { type ReactNode } from 'react';
import { Route, Routes } from 'react-router';

import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AppLayout } from '@/components/layout/AppLayout';
import { RequireAuth } from '@/components/RequireAuth';
import { ThemeProvider } from '@/components/theme/ThemeProvider';
import { queryClient } from '@/lib/query-client';
import { SessionProvider } from '@/providers/SessionProvider';
import { AssetDetailRoute } from '@/routes/AssetDetail';
import { AuthCallbackRoute } from '@/routes/AuthCallback';
import { BundleDetailRoute } from '@/routes/BundleDetail';
import { BundlesRoute } from '@/routes/Bundles';
import { ContributeRoute } from '@/routes/Contribute';
import { IndexRoute } from '@/routes/Index';
import { NotAuthorizedRoute } from '@/routes/NotAuthorized';
import { NotFoundRoute } from '@/routes/NotFound';
import { SignInRoute } from '@/routes/SignIn';

export function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <Toast.Provider>
            <ErrorBoundary scope='application'>
              <Routes>
              <Route element={<AppLayout />} path='/'>
                <Route
                  element={
                    <RouteBoundary scope='Browse'>
                      <IndexRoute />
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
                    <RouteBoundary scope='Auth callback'>
                      <AuthCallbackRoute />
                    </RouteBoundary>
                  }
                  path='auth/callback'
                />
                <Route
                  element={
                    <RouteBoundary scope='Asset detail'>
                      <RequireAuth>
                        <AssetDetailRoute />
                      </RequireAuth>
                    </RouteBoundary>
                  }
                  path='assets/:type/:name/:version'
                />
                <Route
                  element={
                    <RouteBoundary scope='Bundles'>
                      <RequireAuth>
                        <BundlesRoute />
                      </RequireAuth>
                    </RouteBoundary>
                  }
                  path='bundles'
                />
                <Route
                  element={
                    <RouteBoundary scope='Bundle detail'>
                      <RequireAuth>
                        <BundleDetailRoute />
                      </RequireAuth>
                    </RouteBoundary>
                  }
                  path='bundles/:bundleId'
                />
                <Route
                  element={
                    <RouteBoundary scope='Contribute'>
                      <RequireAuth>
                        <ContributeRoute />
                      </RequireAuth>
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
        </SessionProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

function RouteBoundary({ children, scope }: { children: ReactNode; scope: string }) {
  return <ErrorBoundary scope={scope}>{children}</ErrorBoundary>;
}
