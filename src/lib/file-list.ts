import type { Manifest } from './schemas';

/**
 * Paths fetched in addition to `manifest.json` when assembling an asset's zip.
 * The primary download loop in `download-service.ts` iterates this set and
 * tolerates a missing README.md; `manifest.json` is excluded because it is
 * fetched up front to drive the rest of the download.
 */
export function collectFilePaths(manifest: Manifest): string[] {
  const paths = new Set<string>();
  if (manifest.entrypoint) paths.add(manifest.entrypoint);
  paths.add('README.md');
  if (manifest.files) for (const p of manifest.files) paths.add(p);
  paths.delete('manifest.json');
  return [...paths];
}

/**
 * Every path that ends up in the zip for a single asset: `manifest.json` plus
 * the extras returned by {@link collectFilePaths}. Used by the UI so the
 * "Files" card always reflects exactly what the Download button produces.
 */
export function listAssetFiles(manifest: Manifest): string[] {
  return ['manifest.json', ...collectFilePaths(manifest)];
}
