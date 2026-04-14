import { z } from 'zod';

import { AssetType } from './manifest';

export const PlacementConfig = z.object({
  configFile: z.string().optional().describe('Config file to update for registration (e.g., settings.json)'),
  configKey: z.string().optional().describe('Key path within the config file to update'),
  configMerge: z
    .boolean()
    .optional()
    .describe('When true, merge actual asset content into configFile[configKey] instead of writing a simple marker'),
  entrypointName: z
    .string()
    .optional()
    .describe(
      'Fixed filename for the entrypoint when placed in a directory (e.g., "SKILL.md"). When set, path is treated as a directory template.',
    ),
  fileless: z
    .boolean()
    .optional()
    .describe('When true, no standalone files are placed. Asset content is only used for config merging.'),
  path: z.string().describe('File placement path template (supports {name} variable)'),
});
export type PlacementConfig = z.infer<typeof PlacementConfig>;

export const AdapterSchema = z.object({
  $schema: z.string().optional().describe('JSON Schema reference for editor validation and autocomplete'),
  configDetection: z.array(z.string()).describe('Paths/files that indicate this tool is in use (e.g., [".claude/"])'),
  displayName: z.string().describe('Human-readable tool name'),
  placements: z.partialRecord(AssetType, PlacementConfig).describe('File placement rules per asset type'),
  tool: z.string().describe('Tool identifier (e.g., claude-code)'),
});
export type Adapter = z.infer<typeof AdapterSchema>;
