import type { Octokit } from '@octokit/rest';
import type { ZodType } from 'zod';

import { callWithRetry, type RetryOptions } from './fetch-retry';
import { RegistryFetchError, RegistryNotFoundError, RegistryParseError } from './registry-errors';
import { type AssetType, type Bundle, BundleSchema, type Manifest, ManifestSchema } from './schemas';
import { type Registry, RegistrySchema } from './schemas/registry';

export const DEFAULT_OWNER = 'EmergentSoftware';
export const DEFAULT_REPO = 'agentic-toolkit-registry';

/** A pointer to a specific asset version in the registry. */
export interface AssetManifestRef {
  name: string;
  org?: string;
  type: AssetType;
  version: string;
}

/** A pointer to a specific bundle in the registry. */
export interface BundleManifestRef {
  name: string;
  /** Currently unused in the registry path (`bundles/{name}/bundle.json`), but reserved for future versioned bundles. */
  version?: string;
}

/**
 * Common options accepted by every registry client call. An authenticated
 * Octokit instance is required — the CLI can no longer talk to the registry
 * without a signed-in, org-verified session.
 */
export interface RegistryClientOptions {
  octokit: Octokit;
  owner?: string;
  ref?: string;
  repo?: string;
  retry?: RetryOptions;
  signal?: AbortSignal;
}

/** Fetch and validate a specific asset's `manifest.json`. */
export async function fetchAssetManifest(
  ref: AssetManifestRef,
  options: RegistryClientOptions,
): Promise<Manifest> {
  const path = buildAssetManifestPath(ref);
  return await fetchAndParse<Manifest>(path, ManifestSchema, options);
}

/**
 * Fetch an asset's `README.md` as raw markdown. Returns null when the README
 * is absent (HTTP 404) so callers can degrade gracefully.
 */
export async function fetchAssetReadme(
  ref: AssetManifestRef,
  options: RegistryClientOptions,
): Promise<null | string> {
  const manifestPath = buildAssetManifestPath(ref);
  const readmePath = manifestPath.replace(/manifest\.json$/, 'README.md');
  try {
    return await fetchContent(readmePath, options);
  } catch (error) {
    if (error instanceof RegistryNotFoundError) return null;
    throw error;
  }
}

/** Fetch and validate a bundle's `bundle.json`. */
export async function fetchBundleManifest(
  ref: BundleManifestRef,
  options: RegistryClientOptions,
): Promise<Bundle> {
  const path = `bundles/${ref.name}/bundle.json`;
  return await fetchAndParse<Bundle>(path, BundleSchema, options);
}

/** Fetch and validate the top-level `registry.json` from the GitHub registry repo. */
export async function fetchRegistry(options: RegistryClientOptions): Promise<Registry> {
  return await fetchAndParse<Registry>('registry.json', RegistrySchema, options);
}

/**
 * Look up an asset in the registry using the CLI's resolution semantics:
 * when `org` is provided, prefer an org-scoped match and fall back to a
 * global (unscoped) asset; otherwise match only unscoped assets. Returns
 * the matching `RegistryAsset` or `undefined` when no match is found.
 */
export function findExistingAsset(
  registry: Registry,
  query: { name: string; org?: string; type: AssetType },
): undefined | { latest: string; org?: string } {
  const { name, org, type } = query;
  const match = org
    ? registry.assets.find((a) => a.name === name && a.type === type && a.org === org) ??
      registry.assets.find((a) => a.name === name && a.type === type && a.org === undefined)
    : registry.assets.find((a) => a.name === name && a.type === type && a.org === undefined);
  if (!match) return undefined;
  return { latest: match.latest, org: match.org };
}

function buildAssetManifestPath(ref: AssetManifestRef): string {
  const typeDir = `${ref.type}s`;
  const parts = ['assets', typeDir];
  if (ref.org) parts.push(`@${ref.org}`);
  parts.push(ref.name, ref.version, 'manifest.json');
  return parts.join('/');
}

function buildResourceLabel(path: string, options: RegistryClientOptions): string {
  const owner = options.owner ?? DEFAULT_OWNER;
  const repo = options.repo ?? DEFAULT_REPO;
  const refSuffix = options.ref ? `@${options.ref}` : '';
  return `${owner}/${repo}${refSuffix}:${path}`;
}

async function fetchAndParse<T>(
  path: string,
  schema: ZodType<T>,
  options: RegistryClientOptions,
): Promise<T> {
  const decoded = await fetchContent(path, options);
  const label = buildResourceLabel(path, options);

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch (cause) {
    throw new RegistryParseError(`Registry content is not valid JSON: ${label}`, {
      cause,
      payload: decoded,
      url: label,
    });
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new RegistryParseError(`Registry content failed schema validation: ${label}`, {
      payload: decoded,
      url: label,
      zodError: result.error,
    });
  }

  return result.data;
}

/**
 * Fetch the raw UTF-8 contents of a file from the registry repo via Octokit.
 *
 * Uses `mediaType: { format: 'raw' }` so GitHub returns the decoded file body
 * directly rather than a base64-encoded envelope.
 */
async function fetchContent(path: string, options: RegistryClientOptions): Promise<string> {
  const owner = options.owner ?? DEFAULT_OWNER;
  const repo = options.repo ?? DEFAULT_REPO;
  const label = buildResourceLabel(path, options);

  let raw: unknown;
  try {
    const response = await callWithRetry(
      () =>
        options.octokit.rest.repos.getContent({
          mediaType: { format: 'raw' },
          owner,
          path,
          repo,
          ...(options.ref ? { ref: options.ref } : {}),
          request: options.signal ? { signal: options.signal } : undefined,
        }),
      options.retry,
      options.signal,
    );
    raw = response.data;
  } catch (cause: unknown) {
    if (options.signal?.aborted) throw cause;
    const status = (cause as { status?: number }).status;
    if (status === 404) {
      throw new RegistryNotFoundError(`Registry resource not found: ${label}`, { url: label });
    }
    throw new RegistryFetchError(
      `Registry request failed${status !== undefined ? ` with HTTP ${status}` : ''}: ${label}`,
      { cause, status, url: label },
    );
  }

  if (typeof raw === 'string') return raw;
  throw new RegistryParseError(`Registry content was not a raw string: ${label}`, {
    payload: String(raw),
    url: label,
  });
}
