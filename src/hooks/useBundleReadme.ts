import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { useSession } from '@/hooks/useSession';
import { queryKeys } from '@/lib/query-keys';
import { type BundleManifestRef, fetchBundleReadme } from '@/lib/registry-client';

/**
 * Fetch and cache a bundle's README.md. Requires an authenticated session.
 * Resolves to `null` when the README is missing (HTTP 404) — mirrors
 * {@link useAssetReadme}.
 */
export function useBundleReadme(ref: Partial<BundleManifestRef>): UseQueryResult<null | string, Error> {
  const { api } = useSession();
  const enabled = Boolean(api && ref.name && ref.version);

  return useQuery({
    enabled,
    queryFn: ({ signal }) => {
      if (!api) throw new Error('useBundleReadme: no authenticated API client available');
      return fetchBundleReadme(ref as BundleManifestRef, { client: api, signal });
    },
    queryKey: queryKeys.bundleReadme({
      name: ref.name ?? '',
      org: ref.org,
      version: ref.version ?? '',
    }),
  });
}
