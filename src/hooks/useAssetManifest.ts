import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import type { Manifest } from '@/lib/schemas';

import { useSession } from '@/hooks/useSession';
import { queryKeys } from '@/lib/query-keys';
import { type AssetManifestRef, fetchAssetManifest } from '@/lib/registry-client';

/** Fetch and cache a specific asset's manifest.json. Requires an authenticated session. */
export function useAssetManifest(ref: Partial<AssetManifestRef>): UseQueryResult<Manifest, Error> {
  const { api } = useSession();
  const enabled = Boolean(api && ref.name && ref.type && ref.version);

  return useQuery({
    enabled,
    queryFn: ({ signal }) => {
      if (!api) throw new Error('useAssetManifest: no authenticated API client available');
      return fetchAssetManifest(ref as AssetManifestRef, { client: api, signal });
    },
    queryKey: queryKeys.assetManifest({
      name: ref.name ?? '',
      org: ref.org,
      type: ref.type ?? 'skill',
      version: ref.version ?? '',
    }),
  });
}
