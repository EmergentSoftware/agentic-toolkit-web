import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import type { Registry } from '@/lib/schemas';

import { useSession } from '@/hooks/useSession';
import { queryKeys } from '@/lib/query-keys';
import { fetchRegistry } from '@/lib/registry-client';

/** Fetch and cache the registry index. Requires an authenticated session. */
export function useRegistry(): UseQueryResult<Registry, Error> {
  const { api } = useSession();

  return useQuery({
    enabled: Boolean(api),
    queryFn: ({ signal }) => {
      if (!api) throw new Error('useRegistry: no authenticated API client available');
      return fetchRegistry({ client: api, signal });
    },
    queryKey: queryKeys.registry(),
  });
}
