import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import type { Bundle } from '@/lib/schemas';

import { useSession } from '@/hooks/useSession';
import { queryKeys } from '@/lib/query-keys';
import { type BundleManifestRef, fetchBundleManifest, type RegistryClientOptions } from '@/lib/registry-client';

type BundleManifestHookOptions = Omit<RegistryClientOptions, 'octokit' | 'signal'>;

/** Fetch and cache a bundle's bundle.json. Requires an authenticated session. */
export function useBundleManifest(
  ref: Partial<BundleManifestRef>,
  options?: BundleManifestHookOptions,
): UseQueryResult<Bundle, Error> {
  const { octokit } = useSession();
  const enabled = Boolean(octokit && ref.name);

  return useQuery({
    enabled,
    queryFn: ({ signal }) => {
      if (!octokit) throw new Error('useBundleManifest: no authenticated Octokit client available');
      return fetchBundleManifest(ref as BundleManifestRef, { ...options, octokit, signal });
    },
    queryKey: queryKeys.bundleManifest({ name: ref.name ?? '', version: ref.version }),
  });
}
