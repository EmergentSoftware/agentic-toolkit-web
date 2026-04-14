import type { ZodType } from 'zod';

import { fetchWithRetry, type RetryOptions } from './fetch-retry';
import { RegistryFetchError, RegistryNotFoundError, RegistryParseError } from './registry-errors';
import { type AssetType, type Bundle, BundleSchema, type Manifest, ManifestSchema } from './schemas';
import { type Registry, RegistrySchema } from './schemas/registry';

const DEFAULT_OWNER = 'EmergentSoftware';
const DEFAULT_REPO = 'agentic-toolkit-registry';
const GITHUB_API = 'https://api.github.com';

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

/** Common options accepted by every registry client call. */
export interface RegistryClientOptions {
  owner?: string;
  ref?: string;
  repo?: string;
  retry?: RetryOptions;
  signal?: AbortSignal;
  token?: string;
}

interface GitHubContentPayload {
  content?: string;
  encoding?: string;
}

/** Fetch and validate a specific asset's `manifest.json`. */
export async function fetchAssetManifest(
  ref: AssetManifestRef,
  options: RegistryClientOptions = {},
): Promise<Manifest> {
  const path = buildAssetManifestPath(ref);
  const url = buildContentsUrl(options, path);
  return await fetchAndParse<Manifest>(url, ManifestSchema, options);
}

/** Fetch and validate a bundle's `bundle.json`. */
export async function fetchBundleManifest(
  ref: BundleManifestRef,
  options: RegistryClientOptions = {},
): Promise<Bundle> {
  const path = `bundles/${encodePathSegment(ref.name)}/bundle.json`;
  const url = buildContentsUrl(options, path);
  return await fetchAndParse<Bundle>(url, BundleSchema, options);
}

/** Fetch and validate the top-level `registry.json` from the GitHub registry repo. */
export async function fetchRegistry(options: RegistryClientOptions = {}): Promise<Registry> {
  const url = buildContentsUrl(options, 'registry.json');
  return await fetchAndParse<Registry>(url, RegistrySchema, options);
}

function buildAssetManifestPath(ref: AssetManifestRef): string {
  const typeDir = `${ref.type}s`;
  const parts = ['assets', typeDir];
  if (ref.org) parts.push(encodePathSegment(ref.org));
  parts.push(encodePathSegment(ref.name), encodePathSegment(ref.version), 'manifest.json');
  return parts.join('/');
}

function buildContentsUrl(options: RegistryClientOptions, path: string): string {
  const owner = options.owner ?? DEFAULT_OWNER;
  const repo = options.repo ?? DEFAULT_REPO;
  const base = `${GITHUB_API}/repos/${encodePathSegment(owner)}/${encodePathSegment(repo)}/contents/${path}`;
  return options.ref ? `${base}?ref=${encodeURIComponent(options.ref)}` : base;
}

function buildHeaders(token: string | undefined): Headers {
  const headers = new Headers({
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  });
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return headers;
}

function decodeBase64Content(payload: GitHubContentPayload): string {
  if (!payload.content || payload.encoding !== 'base64') {
    throw new Error('GitHub Contents payload missing base64 content');
  }
  const sanitized = payload.content.replace(/\s+/g, '');
  const binary = atob(sanitized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function encodePathSegment(segment: string): string {
  return encodeURIComponent(segment).replace(/%40/g, '@');
}

async function fetchAndParse<T>(
  url: string,
  schema: ZodType<T>,
  options: RegistryClientOptions,
): Promise<T> {
  let response: Response;
  try {
    response = await fetchWithRetry(
      url,
      { headers: buildHeaders(options.token), signal: options.signal },
      options.retry,
    );
  } catch (cause) {
    if (options.signal?.aborted) throw cause;
    throw new RegistryFetchError(`Network error while fetching ${url}`, { cause, url });
  }

  if (response.status === 404) {
    throw new RegistryNotFoundError(`Registry resource not found: ${url}`, { url });
  }

  if (!response.ok) {
    throw new RegistryFetchError(`Registry request failed with HTTP ${response.status}`, {
      status: response.status,
      url,
    });
  }

  const rawBody = await response.text();

  let envelope: GitHubContentPayload;
  try {
    envelope = JSON.parse(rawBody) as GitHubContentPayload;
  } catch (cause) {
    throw new RegistryParseError(`Registry response is not valid JSON: ${url}`, {
      cause,
      payload: rawBody,
      url,
    });
  }

  let decoded: string;
  try {
    decoded = decodeBase64Content(envelope);
  } catch (cause) {
    throw new RegistryParseError(`Registry response is missing decodable base64 content: ${url}`, {
      cause,
      payload: rawBody,
      url,
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(decoded);
  } catch (cause) {
    throw new RegistryParseError(`Registry content is not valid JSON: ${url}`, {
      cause,
      payload: decoded,
      url,
    });
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    throw new RegistryParseError(`Registry content failed schema validation: ${url}`, {
      payload: decoded,
      url,
      zodError: result.error,
    });
  }

  return result.data;
}
