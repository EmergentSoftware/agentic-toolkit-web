import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import type { Bundle } from '@/lib/schemas';

import { useSession } from '@/hooks/useSession';
import { queryKeys } from '@/lib/query-keys';
import { type BundleManifestRef, fetchBundleManifest } from '@/lib/registry-client';

/** Fetch and cache a bundle's bundle.json. Requires an authenticated session. */
export function useBundleManifest(ref: Partial<BundleManifestRef>): UseQueryResult<Bundle, Error> {
  const { api } = useSession();
  const enabled = Boolean(api && ref.name && ref.version);

  return useQuery({
    enabled,
    queryFn: ({ signal }) => {
      if (!api) throw new Error('useBundleManifest: no authenticated API client available');
      return fetchBundleManifest(ref as BundleManifestRef, { client: api, signal });
    },
    queryKey: queryKeys.bundleManifest({ name: ref.name ?? '', org: ref.org, version: ref.version }),
  });
}
