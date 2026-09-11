import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { useSession } from '@/hooks/useSession';
import { queryKeys } from '@/lib/query-keys';
import { type AssetManifestRef, fetchAssetReadme } from '@/lib/registry-client';

/**
 * Fetch and cache an asset's README.md. Requires an authenticated session.
 * Resolves to `null` when the README is missing (HTTP 404).
 */
export function useAssetReadme(ref: Partial<AssetManifestRef>): UseQueryResult<null | string, Error> {
  const { api } = useSession();
  const enabled = Boolean(api && ref.name && ref.type && ref.version);

  return useQuery({
    enabled,
    queryFn: ({ signal }) => {
      if (!api) throw new Error('useAssetReadme: no authenticated API client available');
      return fetchAssetReadme(ref as AssetManifestRef, { client: api, signal });
    },
    queryKey: queryKeys.assetReadme({
      name: ref.name ?? '',
      org: ref.org,
      type: ref.type ?? 'skill',
      version: ref.version ?? '',
    }),
  });
}
