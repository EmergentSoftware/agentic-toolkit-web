import { z } from 'zod';

import { AssetType } from './manifest';

export const ConfigSchema = z.object({
  cacheDir: z.string().optional().describe('Override cache directory (defaults to ~/.atk/cache/)'),
  cacheTtlMinutes: z.number().optional().describe('Cache TTL in minutes for registry data'),
  githubToken: z.string().optional().describe('GitHub token override (defaults to gh auth token)'),
  org: z.string().optional().describe('Default organization scope for asset resolution'),
  registryBranch: z.string().optional().describe('Override registry branch for GitHub API calls (defaults to main)'),
  registryUrl: z.string().optional().describe('Override registry URL (defaults to GitHub repo)'),
});
export type Config = z.infer<typeof ConfigSchema>;

export const DEFAULT_CONFIG: Config = {
  cacheTtlMinutes: 5,
};

const ProjectConfigBase = z.object({
  frozenAssets: z
    .array(
      z.object({
        name: z.string().describe('Asset name'),
        org: z.string().optional().describe('Organization scope for the asset'),
        type: AssetType.describe('Asset type'),
      }),
    )
    .optional()
    .describe('Assets frozen to prevent sync and update from overwriting local modifications'),
  tools: z.array(z.string()).min(1).describe('Tools this project is configured for'),
});

export const ProjectConfigSchema = z.preprocess((val) => {
  if (val && typeof val === 'object' && 'tool' in val) {
    const obj = val as Record<string, unknown>;

    if (typeof obj.tool === 'string') {
      const { tool, ...rest } = obj;

      return { ...rest, tools: [tool] };
    }
  }

  return val;
}, ProjectConfigBase);
export type ProjectConfig = z.infer<typeof ProjectConfigBase>;
