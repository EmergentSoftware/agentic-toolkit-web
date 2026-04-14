import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import type { Manifest } from '@/lib/schemas';

import { queryKeys } from '@/lib/query-keys';
import { type AssetManifestRef, fetchAssetManifest, type RegistryClientOptions } from '@/lib/registry-client';

/** Fetch and cache a specific asset's manifest.json. The query is disabled until all ref fields are set. */
export function useAssetManifest(
  ref: Partial<AssetManifestRef>,
  options?: RegistryClientOptions,
): UseQueryResult<Manifest, Error> {
  const enabled = Boolean(ref.name && ref.type && ref.version);

  return useQuery({
    enabled,
    queryFn: ({ signal }) => fetchAssetManifest(ref as AssetManifestRef, { ...options, signal }),
    queryKey: queryKeys.assetManifest({
      name: ref.name ?? '',
      org: ref.org,
      type: ref.type ?? 'skill',
      version: ref.version ?? '',
    }),
  });
}
