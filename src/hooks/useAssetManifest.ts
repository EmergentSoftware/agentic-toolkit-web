import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import type { Manifest } from '@/lib/schemas';

import { useSession } from '@/hooks/useSession';
import { queryKeys } from '@/lib/query-keys';
import { type AssetManifestRef, fetchAssetManifest, type RegistryClientOptions } from '@/lib/registry-client';

type AssetManifestHookOptions = Omit<RegistryClientOptions, 'octokit' | 'signal'>;

/** Fetch and cache a specific asset's manifest.json. Requires an authenticated session. */
export function useAssetManifest(
  ref: Partial<AssetManifestRef>,
  options?: AssetManifestHookOptions,
): UseQueryResult<Manifest, Error> {
  const { octokit } = useSession();
  const enabled = Boolean(octokit && ref.name && ref.type && ref.version);

  return useQuery({
    enabled,
    queryFn: ({ signal }) => {
      if (!octokit) throw new Error('useAssetManifest: no authenticated Octokit client available');
      return fetchAssetManifest(ref as AssetManifestRef, { ...options, octokit, signal });
    },
    queryKey: queryKeys.assetManifest({
      name: ref.name ?? '',
      org: ref.org,
      type: ref.type ?? 'skill',
      version: ref.version ?? '',
    }),
  });
}
