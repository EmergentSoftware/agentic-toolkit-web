import { describe, expect, it } from 'vitest';

import {
  base64ToBytes,
  basename,
  bytesToBase64,
  bytesToFileEntry,
  decodeUtf8,
  isBinaryEntry,
  stripCommonRoot,
} from '@/lib/file-entry';

describe('basename', () => {
  it('returns the final path segment', () => {
    expect(basename('a/b/c.md')).toBe('c.md');
    expect(basename('c.md')).toBe('c.md');
    expect(basename('a/')).toBe('');
  });
});

describe('base64 round-trip', () => {
  it('encodes and decodes arbitrary bytes losslessly', () => {
    const bytes = new Uint8Array([0, 1, 2, 255, 254, 128, 0, 42]);
    const encoded = bytesToBase64(bytes);
    expect(base64ToBytes(encoded)).toEqual(bytes);
  });

  it('handles a large payload without stack overflow', () => {
    const bytes = new Uint8Array(200_000).map((_, i) => i % 256);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });
});

describe('decodeUtf8', () => {
  it('decodes valid UTF-8 text', () => {
    const bytes = new TextEncoder().encode('héllo — world');
    expect(decodeUtf8(bytes)).toBe('héllo — world');
  });

  it('rejects invalid UTF-8 byte sequences', () => {
    expect(decodeUtf8(new Uint8Array([0xff, 0xfe, 0xfd]))).toBeNull();
  });

  it('treats embedded NUL bytes as binary', () => {
    const bytes = new Uint8Array([0x68, 0x69, 0x00, 0x68, 0x69]);
    expect(decodeUtf8(bytes)).toBeNull();
  });
});

describe('bytesToFileEntry', () => {
  it('marks text content as utf8', () => {
    const entry = bytesToFileEntry('SKILL.md', new TextEncoder().encode('# Title'));
    expect(entry).toEqual({ content: '# Title', encoding: 'utf8', path: 'SKILL.md', size: 7 });
    expect(isBinaryEntry(entry)).toBe(false);
  });

  it('marks binary content as base64 and round-trips it', () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01]);
    const entry = bytesToFileEntry('assets/logo.png', bytes);
    expect(entry.encoding).toBe('base64');
    expect(isBinaryEntry(entry)).toBe(true);
    expect(base64ToBytes(entry.content)).toEqual(bytes);
  });
});

describe('stripCommonRoot', () => {
  it('strips a shared leading directory', () => {
    const stripped = stripCommonRoot([
      { path: 'skill/SKILL.md' },
      { path: 'skill/assets/a.png' },
    ]);
    expect(stripped.map((f) => f.path)).toEqual(['SKILL.md', 'assets/a.png']);
  });

  it('leaves divergent roots untouched', () => {
    const files = [{ path: 'a/x.md' }, { path: 'b/y.md' }];
    expect(stripCommonRoot(files)).toEqual(files);
  });

  it('leaves flat (root-level) files untouched', () => {
    const files = [{ path: 'SKILL.md' }];
    expect(stripCommonRoot(files)).toEqual(files);
  });

  it('preserves extra properties while rewriting paths', () => {
    const stripped = stripCommonRoot([
      { encoding: 'utf8' as const, path: 'skill/SKILL.md' },
    ]);
    expect(stripped[0]).toEqual({ encoding: 'utf8', path: 'SKILL.md' });
  });
});
