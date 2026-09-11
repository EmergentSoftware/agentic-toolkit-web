import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { useSession } from '@/hooks/useSession';
import { queryKeys } from '@/lib/query-keys';
import { type AssetFileList, type AssetManifestRef, fetchAssetFiles } from '@/lib/registry-client';

/**
 * Fetch and cache the API's file listing for an asset version (the
 * authoritative file set; `manifest.files` is empty for many live assets).
 * Requires an authenticated session.
 */
export function useAssetFiles(ref: Partial<AssetManifestRef>): UseQueryResult<AssetFileList, Error> {
  const { api } = useSession();
  const enabled = Boolean(api && ref.name && ref.type && ref.version);

  return useQuery({
    enabled,
    queryFn: ({ signal }) => {
      if (!api) throw new Error('useAssetFiles: no authenticated API client available');
      return fetchAssetFiles(ref as AssetManifestRef, { client: api, signal });
    },
    queryKey: queryKeys.assetFiles({
      name: ref.name ?? '',
      org: ref.org,
      type: ref.type ?? 'skill',
      version: ref.version ?? '',
    }),
  });
}
