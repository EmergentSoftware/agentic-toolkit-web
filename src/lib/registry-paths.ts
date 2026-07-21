import type { AssetType } from './schemas/manifest';

/**
 * Canonical registry path construction for assets and bundles.
 *
 * Implements the org-scoping convention (OrgScopedBundlesDesign §2): a stored
 * `org` value is always **bare** (`cupay`, never `@cupay`). The `@` is a
 * filesystem-layout prefix only — this module is the single place that prepends
 * it, so `registry-client` (Octokit paths) and `download-service` (GitHub API
 * URLs) can never drift on the convention again (audit W1).
 *
 * Builders return raw, unencoded path **segments**. Consumers pick their own
 * encoding: Octokit is handed the joined raw path (it encodes internally),
 * while manually-constructed GitHub API URLs run each segment through
 * {@link encodePathSegment}.
 */

/** A pointer to an asset version directory (or a file within it). */
export interface AssetPathRef {
  name: string;
  /** Bare org name (no `@`); omit for a global asset. */
  org?: string;
  type: AssetType;
  version: string;
}

/** A pointer to a bundle version directory (or a file within it). */
export interface BundlePathRef {
  name: string;
  /** Bare org name (no `@`); omit for a global bundle. */
  org?: string;
  version: string;
}

/**
 * Raw path segments for an asset:
 * `assets/{type}s/[@{org}/]{name}/{version}[/{file}]`.
 */
export function assetPathSegments(ref: AssetPathRef, file?: string): string[] {
  const segments = ['assets', `${ref.type}s`];
  if (ref.org) segments.push(`@${ref.org}`);
  segments.push(ref.name, ref.version);
  if (file) for (const part of file.split('/')) segments.push(part);
  return segments;
}

/**
 * Raw path segments for a bundle:
 * `bundles/[@{org}/]{name}/{version}[/{file}]`. Defaults `file` to
 * `bundle.json`; pass an empty string for the version directory itself.
 */
export function bundlePathSegments(ref: BundlePathRef, file = 'bundle.json'): string[] {
  const segments = ['bundles'];
  if (ref.org) segments.push(`@${ref.org}`);
  segments.push(ref.name, ref.version);
  if (file) for (const part of file.split('/')) segments.push(part);
  return segments;
}

/**
 * URL-encode a single path segment while preserving a leading `@` (which is a
 * legal, and by convention un-escaped, path character in the registry layout).
 */
export function encodePathSegment(segment: string): string {
  return encodeURIComponent(segment).replace(/%40/g, '@');
}

/** Percent-encode raw segments into a slash-joined path (for GitHub API URLs). */
export function encodeRegistryPath(segments: string[]): string {
  return segments.map(encodePathSegment).join('/');
}

/** Join raw segments into a registry path (for Octokit, which encodes internally). */
export function toRegistryPath(segments: string[]): string {
  return segments.join('/');
}
