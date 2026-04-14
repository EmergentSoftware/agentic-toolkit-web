import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import type { Bundle } from '@/lib/schemas';

import { queryKeys } from '@/lib/query-keys';
import { type BundleManifestRef, fetchBundleManifest, type RegistryClientOptions } from '@/lib/registry-client';

/** Fetch and cache a bundle's bundle.json. The query is disabled until `name` is set. */
export function useBundleManifest(
  ref: Partial<BundleManifestRef>,
  options?: RegistryClientOptions,
): UseQueryResult<Bundle, Error> {
  const enabled = Boolean(ref.name);

  return useQuery({
    enabled,
    queryFn: ({ signal }) => fetchBundleManifest(ref as BundleManifestRef, { ...options, signal }),
    queryKey: queryKeys.bundleManifest({ name: ref.name ?? '', version: ref.version }),
  });
}
