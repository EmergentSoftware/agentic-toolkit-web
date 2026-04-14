import type { AssetType } from './schemas';

/** Query-key factory for registry- and session-backed queries. */
export const queryKeys = {
  all: () => ['registry'] as const,
  assetManifest: (ref: { name: string; org?: string; type: AssetType; version: string }) =>
    ['registry', 'asset-manifest', ref.type, ref.org ?? '', ref.name, ref.version] as const,
  assetReadme: (ref: { name: string; org?: string; type: AssetType; version: string }) =>
    ['registry', 'asset-readme', ref.type, ref.org ?? '', ref.name, ref.version] as const,
  bundleManifest: (ref: { name: string; version?: string }) =>
    ['registry', 'bundle-manifest', ref.name, ref.version ?? ''] as const,
  registry: () => ['registry', 'index'] as const,
  session: {
    membership: (org: string, username: string) => ['session', 'membership', org, username] as const,
    user: (tokenFingerprint: string) => ['session', 'user', tokenFingerprint] as const,
  },
};
