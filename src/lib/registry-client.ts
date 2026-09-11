import type { ZodType } from 'zod';

import { z } from 'zod';

import {
  getAssetManifest,
  getAssetReadme,
  getBundleManifest,
  getBundleReadme,
  getRegistry,
  listAssetFiles,
} from './api';
import { type ApiClient, ApiRequestError, type ApiResult, unwrap } from './api-client';
import { RegistryFetchError, RegistryNotFoundError, RegistryParseError } from './registry-errors';
import { AssetType, type Bundle, BundleSchema, type Manifest, ManifestSchema } from './schemas';
import { type Registry, RegistrySchema } from './schemas/registry';

/** One file in an asset version directory, as listed by the API. */
export interface AssetFileEntry {
  /** Path relative to the version directory, e.g. `SKILL.md` or `reference/guide.md`. */
  path: string;
  sha: string;
  size: number;
}

/** The API's directory listing for an asset version (`manifest.json` and `README.md` included). */
export interface AssetFileList {
  files: AssetFileEntry[];
  name: string;
  org?: string;
  type: AssetType;
  version: string;
}

/** A pointer to a specific asset version in the registry. */
export interface AssetManifestRef {
  name: string;
  org?: string;
  type: AssetType;
  version: string;
}

/** A pointer to a specific bundle version in the registry. */
export interface BundleManifestRef {
  name: string;
  /** Bare org name (no `@`) for org-scoped bundles; omit for global bundles. */
  org?: string;
  /** Bundle version (or `latest`). Take it from the registry index entry's `version`. */
  version: string;
}

/**
 * Common options accepted by every registry client call. A configured
 * {@link ApiClient} is required: the web app cannot read the registry without
 * a signed-in, org-verified session.
 */
export interface RegistryClientOptions {
  client: ApiClient;
  signal?: AbortSignal;
}

const AssetFileListSchema = z.object({
  files: z.array(z.object({ path: z.string(), sha: z.string(), size: z.number() })),
  name: z.string(),
  org: z.string().nullable().optional(),
  type: AssetType,
  version: z.string(),
});

/** Fetch the API's file listing for an asset version. */
export async function fetchAssetFiles(ref: AssetManifestRef, options: RegistryClientOptions): Promise<AssetFileList> {
  const label = `${describeAsset(ref)} file list`;
  const result = await listAssetFiles({
    client: options.client,
    path: assetPath(ref),
    query: orgQuery(ref.org),
    signal: options.signal,
  });
  const parsed = parseResponse(unwrapRegistry(result, label), AssetFileListSchema, label);
  return { ...parsed, org: parsed.org ?? undefined };
}

/** Fetch and validate a specific asset's `manifest.json`. */
export async function fetchAssetManifest(ref: AssetManifestRef, options: RegistryClientOptions): Promise<Manifest> {
  const label = `${describeAsset(ref)} manifest`;
  const result = await getAssetManifest({
    client: options.client,
    path: assetPath(ref),
    query: orgQuery(ref.org),
    signal: options.signal,
  });
  return parseResponse(unwrapRegistry(result, label), ManifestSchema, label);
}

/**
 * Fetch an asset's `README.md` as raw markdown. Returns null when the README
 * is absent (HTTP 404) so callers can degrade gracefully.
 */
export async function fetchAssetReadme(ref: AssetManifestRef, options: RegistryClientOptions): Promise<null | string> {
  const result = await getAssetReadme({
    client: options.client,
    parseAs: 'text',
    path: assetPath(ref),
    query: orgQuery(ref.org),
    signal: options.signal,
  });
  if (result.response?.status === 404) return null;
  const data = unwrapRegistry(result, `${describeAsset(ref)} README`);
  return typeof data === 'string' ? data : String(data);
}

/** Fetch and validate a bundle's `bundle.json` from its versioned registry path. */
export async function fetchBundleManifest(ref: BundleManifestRef, options: RegistryClientOptions): Promise<Bundle> {
  const label = `${describeBundle(ref)} manifest`;
  const result = await getBundleManifest({
    client: options.client,
    path: { name: ref.name, version: ref.version },
    query: orgQuery(ref.org),
    signal: options.signal,
  });
  return parseResponse(unwrapRegistry(result, label), BundleSchema, label);
}

/**
 * Fetch a bundle's `README.md` as raw markdown. Returns null when the README
 * is absent (HTTP 404) so callers can degrade gracefully.
 */
export async function fetchBundleReadme(
  ref: BundleManifestRef,
  options: RegistryClientOptions,
): Promise<null | string> {
  const result = await getBundleReadme({
    client: options.client,
    parseAs: 'text',
    path: { name: ref.name, version: ref.version },
    query: orgQuery(ref.org),
    signal: options.signal,
  });
  if (result.response?.status === 404) return null;
  const data = unwrapRegistry(result, `${describeBundle(ref)} README`);
  return typeof data === 'string' ? data : String(data);
}

/** Fetch and validate the registry index (`registry.json`) from the ATK API. */
export async function fetchRegistry(options: RegistryClientOptions): Promise<Registry> {
  const label = 'the registry index';
  const result = await getRegistry({ client: options.client, signal: options.signal });
  return parseResponse(unwrapRegistry(result, label), RegistrySchema, label);
}

/**
 * Look up an asset in the registry using strict, symmetric scope matching:
 * an org-scoped query matches only entries in the same org; an unscoped
 * query matches only unscoped entries. Cross-scope name collisions are
 * never reported as matches.
 */
export function findExistingAsset(
  registry: Registry,
  query: { name: string; org?: string; type: AssetType },
): undefined | { latest: string; org?: string } {
  const { name, org, type } = query;
  const match = registry.assets.find((a) => a.name === name && a.type === type && a.org === (org || undefined));
  if (!match) return undefined;
  return { latest: match.latest, org: match.org };
}

/**
 * Look up a bundle in the registry index using strict, symmetric scope
 * matching (mirrors {@link findExistingAsset}): an org-scoped query matches
 * only bundles in the same org; an unscoped query matches only global bundles.
 * Cross-scope name collisions are never reported as matches. Returns the latest
 * published version and the matched bundle's org, or undefined when absent.
 */
export function findExistingBundle(
  registry: Registry,
  query: { name: string; org?: string },
): undefined | { latest: string; org?: string } {
  const { name, org } = query;
  const match = registry.bundles?.find((b) => b.name === name && b.org === (org || undefined));
  if (!match) return undefined;
  return { latest: match.version, org: match.org };
}

function assetPath(ref: AssetManifestRef): { name: string; type: AssetType; version: string } {
  return { name: ref.name, type: ref.type, version: ref.version };
}

function describeAsset(ref: AssetManifestRef): string {
  return `${ref.type} ${ref.org ? `@${ref.org}/` : ''}${ref.name}@${ref.version}`;
}

function describeBundle(ref: BundleManifestRef): string {
  return `bundle ${ref.org ? `@${ref.org}/` : ''}${ref.name}@${ref.version}`;
}

function orgQuery(org: string | undefined): undefined | { org?: string } {
  return org ? { org } : undefined;
}

/** Validate an already-parsed API response body against a Zod schema. */
function parseResponse<T>(data: unknown, schema: ZodType<T>, label: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new RegistryParseError(`Registry content failed schema validation: ${label}`, {
      payload: safeStringify(data),
      url: label,
      zodError: result.error,
    });
  }
  return result.data;
}

function safeStringify(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/**
 * {@link unwrap} an API result, translating failures into the registry error
 * types the UI switches on: 404 → {@link RegistryNotFoundError}, everything
 * else → {@link RegistryFetchError} (with the HTTP status when there was one).
 */
function unwrapRegistry<T>(result: ApiResult<T>, resource: string): T {
  try {
    return unwrap(result, resource);
  } catch (error) {
    if (error instanceof ApiRequestError) {
      if (error.status === 404) {
        throw new RegistryNotFoundError(`Registry resource not found: ${resource}`, { url: resource });
      }
      throw new RegistryFetchError(error.message, {
        cause: error,
        status: error.status || undefined,
        url: resource,
      });
    }
    throw error;
  }
}
