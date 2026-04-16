import JSZip from 'jszip';

import type { BundleAssetRef } from './schemas/bundle';

import { fetchWithRetry, type RetryOptions } from './fetch-retry';
import { collectFilePaths } from './file-list';
import { RegistryFetchError, RegistryNotFoundError, RegistryParseError } from './registry-errors';
import { type AssetType, type Bundle, BundleSchema, type Manifest, ManifestSchema } from './schemas';

const DEFAULT_OWNER = 'EmergentSoftware';
const DEFAULT_REPO = 'agentic-toolkit-registry';
const GITHUB_API = 'https://api.github.com';

export interface AssetRef {
  name: string;
  org?: string;
  type: AssetType;
  version: string;
}

export interface DownloadAssetOptions {
  owner?: string;
  ref?: string;
  repo?: string;
  retry?: RetryOptions;
  signal?: AbortSignal;
  token?: string;
  /** Injection seams for testing. */
  triggerDownload?: (blob: Blob, filename: string) => void;
}

export interface DownloadBundleOptions extends DownloadAssetOptions {
  /**
   * Resolve a version for a bundle member that omits its own `version`.
   * Typically wired to the registry's `latest` field. Receives the member ref
   * exactly as it appears in `bundle.json`.
   */
  resolveVersion?: (member: BundleAssetRef) => string | undefined;
}

interface FetchedAssetBundle {
  files: Map<string, Uint8Array>;
  manifest: Manifest;
  manifestBytes: Uint8Array;
  ref: AssetRef;
}

interface FetchFileOptions {
  tolerateMissing?: boolean;
}

/**
 * Fetch an asset and all its transitive dependencies, assemble them into a
 * JSZip archive, and trigger a browser download. The primary asset's files sit
 * flat at the zip root; each dependency is placed under `dependencies/{name}/`.
 */
export async function downloadAsset(
  ref: AssetRef,
  options: DownloadAssetOptions = {},
): Promise<{ blob: Blob; filename: string }> {
  const visited = new Map<string, FetchedAssetBundle>();
  const rootBundle = await fetchAssetBundle(ref, options, visited);

  const zip = new JSZip();
  const rootFolder = zip.folder(ref.name);
  if (!rootFolder) throw new Error(`Failed to create zip folder for ${ref.name}`);
  addBundleToZip(rootFolder, rootBundle);

  for (const [key, bundle] of visited) {
    if (key === refKey(ref)) continue;
    const folder = zip.folder(`dependencies/${bundle.ref.name}`);
    if (!folder) throw new Error(`Failed to create zip folder for ${bundle.ref.name}`);
    addBundleToZip(folder, bundle);
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  const filename = `${ref.name}-${ref.version}.zip`;

  const trigger = options.triggerDownload ?? defaultTriggerDownload;
  trigger(blob, filename);

  return { blob, filename };
}

/**
 * Fetch a bundle manifest and every member asset (with transitive dependencies)
 * and assemble a single JSZip archive. The bundle's `bundle.json` sits at the
 * zip root; each member asset's files are placed flat under `{memberName}/`.
 * Transitive dependencies of each member are placed under
 * `{memberName}/dependencies/{depName}/`.
 *
 * Member versions come from the {@link BundleAssetRef}; when a member omits
 * `version`, the optional `resolveVersion` callback is consulted (typically
 * wired to the registry's `latest`).
 */
export async function downloadBundle(
  name: string,
  options: DownloadBundleOptions = {},
): Promise<{ blob: Blob; filename: string }> {
  const bundle = await fetchBundleManifestForDownload(name, options);

  const zip = new JSZip();
  zip.file('bundle.json', `${JSON.stringify(bundle, null, 2)}\n`);

  for (const member of bundle.assets) {
    const version = resolveMemberVersion(member, options);
    if (!version) {
      throw new Error(
        `Bundle member ${member.type}:${member.name} is missing a version and no resolver provided one.`,
      );
    }
    const memberRef: AssetRef = { name: member.name, org: member.org, type: member.type, version };
    const visited = new Map<string, FetchedAssetBundle>();
    const rootBundle = await fetchAssetBundle(memberRef, options, visited);

    const memberFolder = zip.folder(member.name);
    if (!memberFolder) throw new Error(`Failed to create zip folder for ${member.name}`);
    addBundleToZip(memberFolder, rootBundle);

    for (const [key, dep] of visited) {
      if (key === refKey(memberRef)) continue;
      const depFolder = memberFolder.folder(`dependencies/${dep.ref.name}`);
      if (!depFolder) throw new Error(`Failed to create zip folder for ${dep.ref.name}`);
      addBundleToZip(depFolder, dep);
    }
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  const filename = `${bundle.name}-${bundle.version}.zip`;

  const trigger = options.triggerDownload ?? defaultTriggerDownload;
  trigger(blob, filename);

  return { blob, filename };
}

function addBundleToZip(zip: JSZip, bundle: FetchedAssetBundle): void {
  for (const [path, bytes] of bundle.files) {
    zip.file(path, bytes);
  }
}

function buildBundleManifestUrl(name: string, options: DownloadBundleOptions): string {
  const owner = options.owner ?? DEFAULT_OWNER;
  const repo = options.repo ?? DEFAULT_REPO;
  const path = `bundles/${encodePathSegment(name)}/bundle.json`;
  const base = `${GITHUB_API}/repos/${encodePathSegment(owner)}/${encodePathSegment(repo)}/contents/${path}`;
  return options.ref ? `${base}?ref=${encodeURIComponent(options.ref)}` : base;
}

function buildFileUrl(ref: AssetRef, relativePath: string, options: DownloadAssetOptions): string {
  const owner = options.owner ?? DEFAULT_OWNER;
  const repo = options.repo ?? DEFAULT_REPO;
  const typeDir = `${ref.type}s`;
  const parts = ['assets', typeDir];
  if (ref.org) parts.push(encodePathSegment(`@${ref.org}`));
  parts.push(encodePathSegment(ref.name), encodePathSegment(ref.version));
  for (const segment of relativePath.split('/')) parts.push(encodePathSegment(segment));
  const base = `${GITHUB_API}/repos/${encodePathSegment(owner)}/${encodePathSegment(repo)}/contents/${parts.join('/')}`;
  return options.ref ? `${base}?ref=${encodeURIComponent(options.ref)}` : base;
}

function decodeBase64(encoded: string): Uint8Array {
  const sanitized = encoded.replace(/\s+/g, '');
  const binary = atob(sanitized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function defaultTriggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function encodePathSegment(segment: string): string {
  return encodeURIComponent(segment).replace(/%40/g, '@');
}
async function fetchAssetBundle(
  ref: AssetRef,
  options: DownloadAssetOptions,
  visited: Map<string, FetchedAssetBundle>,
): Promise<FetchedAssetBundle> {
  const key = refKey(ref);
  const existing = visited.get(key);
  if (existing) return existing;

  const placeholder = {} as FetchedAssetBundle;
  visited.set(key, placeholder);

  const manifestBytes = await fetchFileBytes(ref, 'manifest.json', options);
  const manifestUrl = buildFileUrl(ref, 'manifest.json', options);
  const manifestText = new TextDecoder().decode(manifestBytes);
  let parsed: unknown;
  try {
    parsed = JSON.parse(manifestText);
  } catch (cause) {
    throw new RegistryParseError(`Asset manifest is not valid JSON: ${manifestUrl}`, {
      cause,
      payload: manifestText,
      url: manifestUrl,
    });
  }
  const result = ManifestSchema.safeParse(parsed);
  if (!result.success) {
    throw new RegistryParseError(`Asset manifest failed schema validation: ${manifestUrl}`, {
      payload: manifestText,
      url: manifestUrl,
      zodError: result.error,
    });
  }
  const manifest = result.data;

  const files = new Map<string, Uint8Array>();
  files.set('manifest.json', manifestBytes);

  const extraPaths = collectFilePaths(manifest);

  for (const path of extraPaths) {
    const bytes = await fetchFileBytes(ref, path, options, { tolerateMissing: path === 'README.md' });
    if (bytes) files.set(path, bytes);
  }

  const bundle: FetchedAssetBundle = { files, manifest, manifestBytes, ref };
  visited.set(key, bundle);

  if (manifest.dependencies && manifest.dependencies.length > 0) {
    for (const dep of manifest.dependencies) {
      if (!dep.version) {
        throw new Error(
          `Dependency ${dep.type}:${dep.name} is missing a version — an explicit version is required for download.`,
        );
      }
      const depRef: AssetRef = { name: dep.name, type: dep.type, version: dep.version };
      await fetchAssetBundle(depRef, options, visited);
    }
  }

  return bundle;
}
async function fetchBundleManifestForDownload(
  name: string,
  options: DownloadBundleOptions,
): Promise<Bundle> {
  const url = buildBundleManifestUrl(name, options);
  const bytes = await fetchFileBytesRaw(url, options);
  const text = new TextDecoder().decode(bytes);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (cause) {
    throw new RegistryParseError(`Bundle manifest is not valid JSON: ${url}`, {
      cause,
      payload: text,
      url,
    });
  }
  const result = BundleSchema.safeParse(parsed);
  if (!result.success) {
    throw new RegistryParseError(`Bundle manifest failed schema validation: ${url}`, {
      payload: text,
      url,
      zodError: result.error,
    });
  }
  return result.data;
}

async function fetchFileBytes(
  ref: AssetRef,
  relativePath: string,
  options: DownloadAssetOptions,
  fileOptions?: FetchFileOptions,
): Promise<Uint8Array>;
async function fetchFileBytes(
  ref: AssetRef,
  relativePath: string,
  options: DownloadAssetOptions,
  fileOptions: { tolerateMissing: true },
): Promise<null | Uint8Array>;
async function fetchFileBytes(
  ref: AssetRef,
  relativePath: string,
  options: DownloadAssetOptions,
  fileOptions: FetchFileOptions = {},
): Promise<null | Uint8Array> {
  const url = buildFileUrl(ref, relativePath, options);
  const headers = new Headers({
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  });
  if (options.token) headers.set('Authorization', `Bearer ${options.token}`);

  let response: Response;
  try {
    response = await fetchWithRetry(url, { headers, signal: options.signal }, options.retry);
  } catch (cause) {
    if (options.signal?.aborted) throw cause;
    throw new RegistryFetchError(`Network error while fetching ${url}`, { cause, url });
  }

  if (response.status === 404) {
    if (fileOptions.tolerateMissing) return null;
    throw new RegistryNotFoundError(`Asset file not found: ${url}`, { url });
  }

  if (!response.ok) {
    throw new RegistryFetchError(`Registry request failed with HTTP ${response.status}`, {
      status: response.status,
      url,
    });
  }

  const rawBody = await response.text();
  let envelope: { content?: string; encoding?: string };
  try {
    envelope = JSON.parse(rawBody) as { content?: string; encoding?: string };
  } catch (cause) {
    throw new RegistryParseError(`Registry response is not valid JSON: ${url}`, {
      cause,
      payload: rawBody,
      url,
    });
  }

  if (!envelope.content || envelope.encoding !== 'base64') {
    throw new RegistryParseError(`Registry response is missing decodable base64 content: ${url}`, {
      payload: rawBody,
      url,
    });
  }

  return decodeBase64(envelope.content);
}
async function fetchFileBytesRaw(url: string, options: DownloadBundleOptions): Promise<Uint8Array> {
  const headers = new Headers({
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  });
  if (options.token) headers.set('Authorization', `Bearer ${options.token}`);

  let response: Response;
  try {
    response = await fetchWithRetry(url, { headers, signal: options.signal }, options.retry);
  } catch (cause) {
    if (options.signal?.aborted) throw cause;
    throw new RegistryFetchError(`Network error while fetching ${url}`, { cause, url });
  }

  if (response.status === 404) {
    throw new RegistryNotFoundError(`Bundle manifest not found: ${url}`, { url });
  }
  if (!response.ok) {
    throw new RegistryFetchError(`Registry request failed with HTTP ${response.status}`, {
      status: response.status,
      url,
    });
  }

  const rawBody = await response.text();
  let envelope: { content?: string; encoding?: string };
  try {
    envelope = JSON.parse(rawBody) as { content?: string; encoding?: string };
  } catch (cause) {
    throw new RegistryParseError(`Registry response is not valid JSON: ${url}`, {
      cause,
      payload: rawBody,
      url,
    });
  }
  if (!envelope.content || envelope.encoding !== 'base64') {
    throw new RegistryParseError(`Registry response is missing decodable base64 content: ${url}`, {
      payload: rawBody,
      url,
    });
  }
  return decodeBase64(envelope.content);
}
function refKey(ref: AssetRef): string {
  return `${ref.type}:${ref.org ?? ''}:${ref.name}:${ref.version}`;
}

function resolveMemberVersion(
  member: BundleAssetRef,
  options: DownloadBundleOptions,
): string | undefined {
  if (member.version) return member.version;
  return options.resolveVersion?.(member);
}
