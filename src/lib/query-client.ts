import { QueryClient } from '@tanstack/react-query';

import { RegistryNotFoundError } from './registry-errors';

/** Build a QueryClient with sane defaults for registry data fetching. */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: 30 * 60 * 1_000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          if (error instanceof RegistryNotFoundError) return false;
          return failureCount < 2;
        },
        staleTime: 5 * 60 * 1_000,
      },
    },
  });
}

/** Shared QueryClient instance for the app. */
export const queryClient = createQueryClient();
