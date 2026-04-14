import { z } from 'zod';

import { BundleAssetRef } from './bundle';
import { AssetType } from './manifest';

export const RegistryAssetVersionSchema = z.object({
  author: z.string().describe('Author'),
  checksum: z.string().describe('SHA-256 checksum of the asset directory'),
  dependencies: z
    .array(
      z.object({
        name: z.string(),
        type: AssetType,
        version: z.string().optional().describe('Semver range for the dependency'),
      }),
    )
    .optional()
    .describe('Asset dependencies'),
  description: z.string().describe('Short description'),
  files: z.array(z.string()).optional().describe('Files included in this version'),
  security: z
    .object({
      permissions: z.array(z.string()).optional().describe('Permissions this asset requires'),
      reviewedAt: z.string().optional().describe('ISO date of security review'),
      reviewedBy: z.string().optional().describe('Who reviewed this asset'),
    })
    .optional()
    .describe('Security review information'),
  tools: z.array(z.string()).describe('Compatible tool identifiers'),
});
export type RegistryAssetVersion = z.infer<typeof RegistryAssetVersionSchema>;

export const RegistryAssetVersionsMapSchema = z.record(z.string(), RegistryAssetVersionSchema);
export type RegistryAssetVersionsMap = z.infer<typeof RegistryAssetVersionsMapSchema>;

export const RegistryAsset = z.object({
  latest: z.string().describe('Latest version semver string'),
  name: z.string().describe('Asset name'),
  org: z.string().optional().describe('Organization scope for this asset'),
  tags: z.array(z.string()).describe('Tags'),
  type: AssetType.describe('Asset type'),
  versions: RegistryAssetVersionsMapSchema.describe('Map of semver string to version metadata'),
});
export type RegistryAsset = z.infer<typeof RegistryAsset>;

export const RegistryBundle = z.object({
  assetCount: z.number().describe('Number of assets in the bundle'),
  assets: z.array(BundleAssetRef).optional().describe('Assets contained in this bundle'),
  author: z.string().describe('Author'),
  description: z.string().describe('Short description'),
  name: z.string().describe('Bundle name'),
  org: z.string().optional().describe('Organization scope for this bundle'),
  tags: z.array(z.string()).describe('Tags'),
  version: z.string().describe('Latest version'),
});
export type RegistryBundle = z.infer<typeof RegistryBundle>;

export const DeprecatedEntry = z.object({
  deprecatedAt: z.string().describe('ISO date of deprecation'),
  name: z.string().describe('Deprecated asset or bundle name'),
  reason: z.string().describe('Reason for deprecation'),
  replacement: z.string().optional().describe('Suggested replacement name'),
  type: AssetType.optional().describe('Asset type (if asset, not bundle)'),
});
export type DeprecatedEntry = z.infer<typeof DeprecatedEntry>;

export const RegistrySchema = z.object({
  assets: z.array(RegistryAsset).describe('All available assets'),
  bundles: z.array(RegistryBundle).optional().describe('All available bundles'),
  deprecated: z.array(DeprecatedEntry).optional().describe('Deprecated assets and bundles'),
  version: z.string().describe('ISO timestamp when this registry was built'),
});
export type Registry = z.infer<typeof RegistrySchema>;
