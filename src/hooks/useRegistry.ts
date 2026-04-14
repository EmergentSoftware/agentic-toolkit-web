import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import type { Registry } from '@/lib/schemas';

import { useSession } from '@/hooks/useSession';
import { queryKeys } from '@/lib/query-keys';
import { fetchRegistry, type RegistryClientOptions } from '@/lib/registry-client';

type RegistryHookOptions = Omit<RegistryClientOptions, 'octokit' | 'signal'>;

/** Fetch and cache the top-level registry.json. Requires an authenticated session. */
export function useRegistry(options?: RegistryHookOptions): UseQueryResult<Registry, Error> {
  const { octokit } = useSession();

  return useQuery({
    enabled: Boolean(octokit),
    queryFn: ({ signal }) => {
      if (!octokit) throw new Error('useRegistry: no authenticated Octokit client available');
      return fetchRegistry({ ...options, octokit, signal });
    },
    queryKey: queryKeys.registry(),
  });
}
