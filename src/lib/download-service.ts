import { downloadAsset as apiDownloadAsset, downloadBundle as apiDownloadBundle } from './api';
import { type ApiClient, ApiRequestError, type ApiResult, unwrap } from './api-client';
import { RegistryFetchError, RegistryNotFoundError } from './registry-errors';
import { type AssetType } from './schemas';

export interface AssetRef {
  name: string;
  org?: string;
  type: AssetType;
  version: string;
}

export interface DownloadAssetOptions {
  client: ApiClient;
  /** Archive variant; defaults to `zip`. */
  format?: DownloadFormat;
  signal?: AbortSignal;
  /** Injection seam for testing. */
  triggerDownload?: (blob: Blob, filename: string) => void;
}

export interface DownloadBundleOptions {
  client: ApiClient;
  /** Archive variant; defaults to `zip`. */
  format?: DownloadFormat;
  /**
   * Bare org name (no `@`) for org-scoped bundles; omit for global bundles.
   */
  org?: string;
  signal?: AbortSignal;
  /** Injection seam for testing. */
  triggerDownload?: (blob: Blob, filename: string) => void;
  /** The bundle's own version (or `latest`). Take it from the registry index entry's `version`. */
  version: string;
}

/**
 * Download archive variant. `zip` is the full archive; `skill` omits the
 * top-level asset's `manifest.json`/`README.md` and uses a `.skill` extension.
 */
export type DownloadFormat = 'skill' | 'zip';

/**
 * Download an asset (with its transitive dependencies) as one archive built by
 * the ATK API, then hand the blob to the browser. Layout: `{name}/…` plus
 * `dependencies/{dep}/…`; `format: 'skill'` strips the top-level asset's
 * metadata and names the file `{name}-{version}.skill`.
 */
export async function downloadAsset(
  ref: AssetRef,
  options: DownloadAssetOptions,
): Promise<{ blob: Blob; filename: string }> {
  const format = options.format ?? 'zip';
  const result = await apiDownloadAsset({
    client: options.client,
    parseAs: 'blob',
    path: { name: ref.name, type: ref.type, version: ref.version },
    query: { format, ...(ref.org ? { org: ref.org } : {}) },
    signal: options.signal,
  });
  const blob = unwrapDownload(result, `${ref.type} ${ref.org ? `@${ref.org}/` : ''}${ref.name}@${ref.version}`);
  const filename = `${ref.name}-${ref.version}.${format === 'skill' ? 'skill' : 'zip'}`;

  const trigger = options.triggerDownload ?? defaultTriggerDownload;
  trigger(blob, filename);

  return { blob, filename };
}

/**
 * Download a bundle as one archive built by the ATK API: `bundle.json` at the
 * root and each member under `{member}/…` (`format: 'skill'` drops
 * `bundle.json` and nests skill members as `{member}.skill`). The outer file
 * keeps the `.zip` extension in both variants.
 */
export async function downloadBundle(
  name: string,
  options: DownloadBundleOptions,
): Promise<{ blob: Blob; filename: string }> {
  const format = options.format ?? 'zip';
  const result = await apiDownloadBundle({
    client: options.client,
    parseAs: 'blob',
    path: { name, version: options.version },
    query: { format, ...(options.org ? { org: options.org } : {}) },
    signal: options.signal,
  });
  const blob = unwrapDownload(result, `bundle ${options.org ? `@${options.org}/` : ''}${name}@${options.version}`);
  const filename = `${name}-${options.version}.zip`;

  const trigger = options.triggerDownload ?? defaultTriggerDownload;
  trigger(blob, filename);

  return { blob, filename };
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

function unwrapDownload(result: ApiResult<Blob | File>, resource: string): Blob {
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
