import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { useSession } from '@/hooks/useSession';
import { queryKeys } from '@/lib/query-keys';
import { type AssetManifestRef, fetchAssetReadme, type RegistryClientOptions } from '@/lib/registry-client';

type AssetReadmeHookOptions = Omit<RegistryClientOptions, 'octokit' | 'signal'>;

/**
 * Fetch and cache an asset's README.md. Requires an authenticated session.
 * Resolves to `null` when the README is missing (HTTP 404).
 */
export function useAssetReadme(
  ref: Partial<AssetManifestRef>,
  options?: AssetReadmeHookOptions,
): UseQueryResult<null | string, Error> {
  const { octokit } = useSession();
  const enabled = Boolean(octokit && ref.name && ref.type && ref.version);

  return useQuery({
    enabled,
    queryFn: ({ signal }) => {
      if (!octokit) throw new Error('useAssetReadme: no authenticated Octokit client available');
      return fetchAssetReadme(ref as AssetManifestRef, { ...options, octokit, signal });
    },
    queryKey: queryKeys.assetReadme({
      name: ref.name ?? '',
      org: ref.org,
      type: ref.type ?? 'skill',
      version: ref.version ?? '',
    }),
  });
}
