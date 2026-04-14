import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import type { Registry } from '@/lib/schemas';

import { queryKeys } from '@/lib/query-keys';
import { fetchRegistry, type RegistryClientOptions } from '@/lib/registry-client';

/** Fetch and cache the top-level registry.json. */
export function useRegistry(options?: RegistryClientOptions): UseQueryResult<Registry, Error> {
  return useQuery({
    queryFn: ({ signal }) => fetchRegistry({ ...options, signal }),
    queryKey: queryKeys.registry(),
  });
}
