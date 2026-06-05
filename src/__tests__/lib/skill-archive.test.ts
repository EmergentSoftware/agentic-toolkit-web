import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import { base64ToBytes } from '@/lib/file-entry';
import {
  extractSkillArchive,
  hasSkillExtension,
  isSkillArchive,
  sanitizeEntryPath,
  SKILL_ARCHIVE_MAX_FILES,
  SkillArchiveError,
} from '@/lib/skill-archive';

async function makeSkillFile(
  name: string,
  entries: Record<string, string | Uint8Array>,
): Promise<File> {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(entries)) zip.file(path, content);
  const blob = await zip.generateAsync({ type: 'blob' });
  return new File([blob], name, { type: 'application/zip' });
}

describe('hasSkillExtension', () => {
  it('matches .skill and .zip regardless of case', () => {
    expect(hasSkillExtension('foo.skill')).toBe(true);
    expect(hasSkillExtension('FOO.SKILL')).toBe(true);
    expect(hasSkillExtension('foo.zip')).toBe(true);
    expect(hasSkillExtension('foo.md')).toBe(false);
  });
});

describe('isSkillArchive', () => {
  it('detects by extension', async () => {
    const file = await makeSkillFile('my-skill.skill', { 'my-skill/SKILL.md': '# Hi' });
    expect(await isSkillArchive(file)).toBe(true);
  });

  it('detects an extension-less zip by magic bytes', async () => {
    const zipFile = await makeSkillFile('my-skill.skill', { 'my-skill/SKILL.md': '# Hi' });
    const renamed = new File([zipFile], 'mystery', { type: '' });
    expect(await isSkillArchive(renamed)).toBe(true);
  });

  it('rejects a non-zip file', async () => {
    const file = new File(['just text'], 'notes.txt', { type: 'text/plain' });
    expect(await isSkillArchive(file)).toBe(false);
  });
});

describe('extractSkillArchive', () => {
  it('extracts files and strips the single wrapping root folder', async () => {
    const file = await makeSkillFile('emergent-qa.skill', {
      'emergent-qa/SKILL.md': '---\nname: emergent-qa\n---\n# QA',
    });
    const entries = await extractSkillArchive(file);
    expect(entries).toHaveLength(1);
    expect(entries[0].path).toBe('SKILL.md');
    expect(entries[0].encoding).toBe('utf8');
    expect(entries[0].content).toContain('# QA');
  });

  it('preserves binary assets as base64', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02]);
    const file = await makeSkillFile('s.skill', {
      's/assets/logo.png': png,
      's/SKILL.md': '# Skill',
    });
    const entries = await extractSkillArchive(file);
    const logo = entries.find((e) => e.path === 'assets/logo.png');
    expect(logo?.encoding).toBe('base64');
    expect(base64ToBytes(logo!.content)).toEqual(png);
  });

  it('normalizes a lowercase skill.md entrypoint to SKILL.md', async () => {
    const file = await makeSkillFile('s.skill', { 's/skill.md': '# Skill' });
    const entries = await extractSkillArchive(file);
    expect(entries[0].path).toBe('SKILL.md');
  });

  it('rejects a file that is not a zip', async () => {
    const file = new File(['plain text'], 'notes.txt', { type: 'text/plain' });
    await expect(extractSkillArchive(file)).rejects.toBeInstanceOf(SkillArchiveError);
  });

  it('rejects an archive with too many files', async () => {
    const entries: Record<string, string> = {};
    for (let i = 0; i <= SKILL_ARCHIVE_MAX_FILES; i++) entries[`s/file-${i}.txt`] = 'x';
    const file = await makeSkillFile('big.skill', entries);
    await expect(extractSkillArchive(file)).rejects.toBeInstanceOf(SkillArchiveError);
  });
});

describe('sanitizeEntryPath (zip-slip guard)', () => {
  it('rejects parent-directory traversal segments', () => {
    expect(sanitizeEntryPath('s/../../escape.txt')).toBeNull();
    expect(sanitizeEntryPath('../escape.txt')).toBeNull();
  });

  it('rejects drive-letter absolute paths', () => {
    expect(sanitizeEntryPath('C:\\windows\\system32')).toBeNull();
  });

  it('strips leading slashes and backslashes to contain absolute paths', () => {
    expect(sanitizeEntryPath('/etc/passwd')).toBe('etc/passwd');
    expect(sanitizeEntryPath('a\\b\\c.md')).toBe('a/b/c.md');
  });

  it('drops "." segments and passes safe relative paths through', () => {
    expect(sanitizeEntryPath('skill/./assets/logo.png')).toBe('skill/assets/logo.png');
    expect(sanitizeEntryPath('SKILL.md')).toBe('SKILL.md');
  });

  it('rejects empty paths', () => {
    expect(sanitizeEntryPath('')).toBeNull();
    expect(sanitizeEntryPath('/')).toBeNull();
  });
});
