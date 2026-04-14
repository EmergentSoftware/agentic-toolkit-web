import { z } from 'zod';

import { AssetType } from './manifest';

export const InstalledFile = z.object({
  checksum: z.string().describe('SHA-256 checksum of the file contents'),
  sourcePath: z.string().describe('Original path within the asset directory'),
});
export type InstalledFile = z.infer<typeof InstalledFile>;

export const ConfigEntry = z.object({
  checksum: z.string().describe('SHA-256 hex digest of the config entry value'),
  file: z.string().describe('Project-relative POSIX path to the config file'),
  key: z.string().describe('Dot-path key within the config file (e.g. hooks.my-hook)'),
});
export type ConfigEntry = z.infer<typeof ConfigEntry>;

export const InstalledAsset = z.object({
  bundleOrigin: z
    .object({
      name: z.string().describe('Bundle name that sourced this asset'),
      version: z.string().describe('Bundle version at install time'),
    })
    .optional()
    .describe('Bundle that triggered this asset installation'),
  configEntries: z.array(ConfigEntry).optional().describe('Config file entries registered by this asset'),
  dependencies: z
    .array(
      z.object({
        name: z.string().describe('Dependency asset name'),
        org: z.string().optional().describe('Organization scope of the dependency'),
        type: AssetType.describe('Dependency asset type'),
        version: z.string().optional().describe('Dependency version constraint at install time'),
      }),
    )
    .optional()
    .describe('Assets this asset depends on'),
  description: z.string().optional().describe('Short description of the asset'),
  files: z.array(InstalledFile).describe('Files placed by this asset'),
  installedAt: z.string().describe('ISO timestamp of installation'),
  installReason: z
    .enum(['direct', 'dependency'])
    .optional()
    .describe('Whether the user explicitly installed this or it was pulled in as a dependency'),
  name: z.string().describe('Asset name'),
  org: z.string().optional().describe('Organization scope for this asset'),
  pinnedVersion: z.string().optional().describe('Pinned version constraint, if the asset is version-pinned'),
  type: AssetType.describe('Asset type'),
  updatedAt: z.string().optional().describe('ISO timestamp of last update'),
  version: z.string().describe('Installed version'),
});
export type InstalledAsset = z.infer<typeof InstalledAsset>;

export const LockfileSchema = z.object({
  assets: z.array(InstalledAsset).optional().describe('Currently installed assets'),
  lockVersion: z.literal(1).describe('Lock file format version'),
  org: z.string().optional().describe('Organization scope for this lockfile'),
  registryBranch: z.string().optional().describe('Override registry branch for GitHub API calls'),
  registryUrl: z.string().optional().describe('Override registry URL'),
});
export type Lockfile = z.infer<typeof LockfileSchema>;
