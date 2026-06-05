/**
 * Shared file-entry model and helpers for the contribute/publish pipeline.
 *
 * Uploaded files flow through the wizard as {@link FileEntry} objects. Most
 * assets are UTF-8 text (markdown, JSON), but skills can bundle binary assets
 * (images, fonts) — so each entry records an `encoding` and carries binary
 * payloads as base64 to round-trip the exact bytes through the GitHub Git Data
 * API without corruption. A missing `encoding` is treated as `utf8`.
 */

export type FileEncoding = 'base64' | 'utf8';

export interface FileEntry {
  content: string;
  encoding?: FileEncoding;
  path: string;
  size: number;
}

const NUL = String.fromCharCode(0);

/** Decode a base64 string back to raw bytes (inverse of {@link bytesToBase64}). */
export function base64ToBytes(base64: string): Uint8Array {
  const sanitized = base64.replace(/\s+/g, '');
  const binary = atob(sanitized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Return the final path segment (filename) of a `/`-separated path. */
export function basename(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? path : path.slice(i + 1);
}

/** Base64-encode raw bytes, chunked to avoid call-stack limits on large inputs. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const chunk = bytes.subarray(i, i + CHUNK);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

/**
 * Build a {@link FileEntry} from raw bytes, sniffing whether the payload is
 * valid UTF-8 text or binary. Binary payloads are stored as base64 so they
 * survive the publish round-trip intact.
 */
export function bytesToFileEntry(path: string, bytes: Uint8Array): FileEntry {
  const text = decodeUtf8(bytes);
  if (text !== null) {
    return { content: text, encoding: 'utf8', path, size: bytes.length };
  }
  return { content: bytesToBase64(bytes), encoding: 'base64', path, size: bytes.length };
}

/**
 * Decode bytes as strict UTF-8, returning `null` when the bytes are not valid
 * UTF-8 or contain a NUL byte (a strong signal the payload is binary even when
 * it happens to decode). Used to distinguish text from binary uploads.
 */
export function decodeUtf8(bytes: Uint8Array): null | string {
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return text.includes(NUL) ? null : text;
  } catch {
    return null;
  }
}

/** Read a browser `File` into a binary-safe {@link FileEntry}. */
export async function fileToFileEntry(file: File, path: string): Promise<FileEntry> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return bytesToFileEntry(path, bytes);
}

/** True when an entry holds binary (base64) content rather than UTF-8 text. */
export function isBinaryEntry(entry: { encoding?: FileEncoding }): boolean {
  return entry.encoding === 'base64';
}

/**
 * Normalize uploaded file paths by stripping a single common leading directory
 * shared by every entry. Browser folder uploads (`webkitRelativePath` or
 * drag-and-drop of a directory) and `.skill` archives prefix each file with the
 * selected/root folder's name, which otherwise double-nests the asset under its
 * registry path and causes the manifest entrypoint/files fields to reference
 * paths that don't exist in the committed tree. Flat drops and divergent roots
 * are left untouched.
 */
export function stripCommonRoot<T extends { path: string }>(files: T[]): T[] {
  if (files.length === 0) return files;
  const heads = files.map((f) => {
    const i = f.path.indexOf('/');
    return i === -1 ? null : f.path.slice(0, i);
  });
  const root = heads[0];
  if (root === null || heads.some((h) => h !== root)) return files;
  const prefix = `${root}/`;
  return files
    .map((f) => ({ ...f, path: f.path.slice(prefix.length) }))
    .filter((f) => f.path.length > 0);
}
