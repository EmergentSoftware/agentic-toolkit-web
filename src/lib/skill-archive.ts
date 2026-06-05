/**
 * Client-side extraction of Claude desktop `.skill` exports.
 *
 * A `.skill` file is a zip archive (`PK\x03\x04`) whose contents are the raw
 * skill files nested under a single folder named after the skill, e.g.
 * `my-skill/SKILL.md`. The registry stores plain, reviewable, checksummed files
 * — never the opaque archive — so the contribute wizard unpacks the `.skill`
 * here and feeds the resulting {@link FileEntry}s into the normal publish flow,
 * exactly as if the user had dropped the unpacked folder. The CLI stays fully
 * `.skill`-unaware.
 */

import JSZip from 'jszip';

import { basename, bytesToFileEntry, type FileEntry, stripCommonRoot } from './file-entry';

/** Reject individual entries larger than this (protects the browser/PR size). */
export const SKILL_ARCHIVE_MAX_FILE_BYTES = 10 * 1024 * 1024;
/** Reject archives whose extracted total exceeds this. */
export const SKILL_ARCHIVE_MAX_TOTAL_BYTES = 25 * 1024 * 1024;
/** Reject archives with more than this many files. */
export const SKILL_ARCHIVE_MAX_FILES = 500;

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

/** Raised for any malformed, unsafe, or oversized `.skill` archive. */
export class SkillArchiveError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = 'SkillArchiveError';
    if (options?.cause !== undefined) this.cause = options.cause;
  }
}

/**
 * Unpack a `.skill` (or plain zip) archive into binary-safe {@link FileEntry}s.
 * Directory entries are dropped, zip-slip paths are rejected, per-file/total
 * size limits are enforced, the single wrapping root folder is stripped, and a
 * lowercase `skill.md` entrypoint is normalized to `SKILL.md`.
 */
export async function extractSkillArchive(file: File): Promise<FileEntry[]> {
  if (!(await isSkillArchive(file))) {
    throw new SkillArchiveError('That file does not look like a .skill archive (expected a zip).');
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch (cause) {
    throw new SkillArchiveError(
      'The .skill archive could not be read. It may be corrupt or not a zip file.',
      { cause },
    );
  }

  const fileObjs = Object.values(zip.files).filter((entry) => !entry.dir);
  if (fileObjs.length > SKILL_ARCHIVE_MAX_FILES) {
    throw new SkillArchiveError(
      `The archive contains too many files (${fileObjs.length}; max ${SKILL_ARCHIVE_MAX_FILES}).`,
    );
  }

  const entries: FileEntry[] = [];
  let total = 0;
  for (const entry of fileObjs) {
    const safePath = sanitizeEntryPath(entry.name);
    if (safePath === null) {
      throw new SkillArchiveError(`The archive contains an unsafe path: ${entry.name}`);
    }
    const bytes = await entry.async('uint8array');
    if (bytes.length > SKILL_ARCHIVE_MAX_FILE_BYTES) {
      throw new SkillArchiveError(
        `"${safePath}" is too large (${formatMb(bytes.length)}; max ${formatMb(SKILL_ARCHIVE_MAX_FILE_BYTES)}).`,
      );
    }
    total += bytes.length;
    if (total > SKILL_ARCHIVE_MAX_TOTAL_BYTES) {
      throw new SkillArchiveError(
        `The archive is too large to upload (max ${formatMb(SKILL_ARCHIVE_MAX_TOTAL_BYTES)}).`,
      );
    }
    entries.push(bytesToFileEntry(safePath, bytes));
  }

  return stripCommonRoot(entries).map((entry) => ({
    ...entry,
    path: normalizeEntrypointCase(entry.path),
  }));
}

/** True when the filename carries a `.skill` or `.zip` extension. */
export function hasSkillExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.endsWith('.skill') || lower.endsWith('.zip');
}

/**
 * Detect a `.skill`/zip archive by extension, falling back to sniffing the
 * `PK\x03\x04` magic bytes for extension-less files.
 */
export async function isSkillArchive(file: File): Promise<boolean> {
  if (hasSkillExtension(file.name)) return true;
  const head = new Uint8Array(await file.slice(0, ZIP_MAGIC.length).arrayBuffer());
  return ZIP_MAGIC.every((byte, i) => head[i] === byte);
}

/**
 * Normalize a zip entry path and reject anything that escapes the archive root.
 * Returns the cleaned, forward-slashed path, or `null` for absolute paths,
 * drive letters, or any `..` traversal segment (zip-slip). Exported for direct
 * unit testing — JSZip itself resolves `..` on load, so the guard cannot be
 * exercised through a JSZip-built fixture.
 */
export function sanitizeEntryPath(raw: string): null | string {
  const normalized = raw.replace(/\\/g, '/').replace(/^\/+/, '');
  if (normalized === '') return null;
  if (/^[A-Za-z]:/.test(normalized)) return null;
  const segments = normalized.split('/').filter((segment) => segment !== '.');
  if (segments.some((segment) => segment === '..')) return null;
  const cleaned = segments.join('/');
  return cleaned === '' ? null : cleaned;
}

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function normalizeEntrypointCase(path: string): string {
  const base = basename(path);
  if (base !== 'SKILL.md' && base.toLowerCase() === 'skill.md') {
    return `${path.slice(0, path.length - base.length)}SKILL.md`;
  }
  return path;
}
