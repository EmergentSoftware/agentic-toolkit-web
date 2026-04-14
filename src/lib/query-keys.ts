import type { AssetType } from './schemas';

/** Query-key factory for registry-backed queries. All keys live under the `registry` root. */
export const queryKeys = {
  all: () => ['registry'] as const,
  assetManifest: (ref: { name: string; org?: string; type: AssetType; version: string }) =>
    ['registry', 'asset-manifest', ref.type, ref.org ?? '', ref.name, ref.version] as const,
  bundleManifest: (ref: { name: string; version?: string }) =>
    ['registry', 'bundle-manifest', ref.name, ref.version ?? ''] as const,
  registry: () => ['registry', 'index'] as const,
};
