import { z } from 'zod';

import { AssetType } from './manifest';

export const BundleAssetRef = z.object({
  name: z.string().describe('Asset name'),
  org: z.string().optional().describe('Organization scope for this asset reference'),
  type: AssetType.describe('Asset type'),
  version: z.string().optional().describe('Pinned version (latest if omitted)'),
});
export type BundleAssetRef = z.infer<typeof BundleAssetRef>;

export const BundleSchema = z.object({
  $schema: z.string().optional().describe('JSON Schema reference for editor validation and autocomplete'),
  assets: z.array(BundleAssetRef).min(1).describe('Assets included in this bundle'),
  author: z.string().describe('Author name or identifier'),
  description: z.string().describe('What this bundle provides'),
  metadata: z.record(z.string(), z.unknown()).optional().describe('Arbitrary additional metadata'),
  name: z.string().describe('Unique bundle name (kebab-case)'),
  setupInstructions: z.string().optional().describe('Post-install setup instructions (markdown)'),
  tags: z.array(z.string()).optional().describe('Searchable tags'),
  version: z.string().describe('Semver version string'),
});
export type Bundle = z.infer<typeof BundleSchema>;
