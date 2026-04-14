import { valid as semverValid } from 'semver';
import { z } from 'zod';

export const AssetType = z.enum(['skill', 'agent', 'rule', 'hook', 'memory-template', 'mcp-config']);
export type AssetType = z.infer<typeof AssetType>;

export const ToolCompatibility = z.object({
  maxVersion: z.string().optional().describe('Maximum compatible tool version'),
  minVersion: z.string().optional().describe('Minimum compatible tool version'),
  notes: z.string().optional().describe('Compatibility notes'),
  tool: z.string().describe('Tool identifier (e.g., claude-code)'),
});
export type ToolCompatibility = z.infer<typeof ToolCompatibility>;

export const AssetDependency = z.object({
  name: z.string().describe('Dependency asset name'),
  type: AssetType.describe('Dependency asset type'),
  version: z.string().optional().describe('Semver range for the dependency'),
});
export type AssetDependency = z.infer<typeof AssetDependency>;

export const SecurityBlock = z.object({
  permissions: z.array(z.string()).optional().describe('Permissions this asset requires (e.g., filesystem, network)'),
  reviewedAt: z.string().optional().describe('ISO date when the security review occurred'),
  reviewedBy: z.string().optional().describe('Who reviewed this asset for security'),
});
export type SecurityBlock = z.infer<typeof SecurityBlock>;

export const ManifestSchema = z
  .object({
    $schema: z.string().optional().describe('JSON Schema reference for editor validation and autocomplete'),
    author: z.string().describe('Author name or identifier'),
    dependencies: z.array(AssetDependency).optional().describe('Other assets this asset depends on'),
    description: z.string().describe('Short description of what this asset does'),
    entrypoint: z.string().optional().describe('Primary file for this asset (relative to asset directory)'),
    files: z.array(z.string()).optional().describe('Additional files included with this asset (relative paths)'),
    metadata: z.record(z.string(), z.unknown()).optional().describe('Arbitrary additional metadata'),
    name: z.string().describe('Unique asset name (kebab-case)'),
    org: z
      .string()
      .regex(/^[a-zA-Z][a-zA-Z0-9-]*$/)
      .optional()
      .describe('Organization scope for this asset'),
    security: SecurityBlock.optional().describe('Security review information'),
    tags: z.array(z.string()).optional().describe('Searchable tags'),
    tools: z.array(ToolCompatibility).optional().describe('Tool compatibility information'),
    type: AssetType.describe('Asset type'),
    version: z
      .string()
      .describe('Semver version string')
      .refine((v) => semverValid(v) !== null && !v.startsWith('v'), {
        message: 'version must be valid semver (e.g., 1.0.0) without a "v" prefix',
      }),
  })
  .refine((data) => data.type === 'mcp-config' || typeof data.entrypoint === 'string', {
    message: 'entrypoint is required for all asset types except mcp-config',
    path: ['entrypoint'],
  });
export type Manifest = z.infer<typeof ManifestSchema>;
