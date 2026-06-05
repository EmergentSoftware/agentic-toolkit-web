import { describe, expect, it } from 'vitest';

import { parseFrontmatter } from '@/lib/frontmatter';

describe('parseFrontmatter', () => {
  it('returns an empty object when there is no frontmatter', () => {
    expect(parseFrontmatter('# Just a heading\n\nbody')).toEqual({});
  });

  it('parses simple scalar keys', () => {
    const md = ['---', 'name: my-skill', 'description: A short summary', '---', '# Body'].join('\n');
    expect(parseFrontmatter(md)).toMatchObject({
      description: 'A short summary',
      name: 'my-skill',
    });
  });

  it('parses a folded (>) block scalar into a single spaced line', () => {
    const md = [
      '---',
      'name: emergent-qa-refinement',
      'description: >',
      '  This skill refines QA',
      '  test cases into a',
      '  structured plan.',
      '---',
      'body',
    ].join('\n');
    const fm = parseFrontmatter(md);
    expect(fm.name).toBe('emergent-qa-refinement');
    expect(fm.description).toBe('This skill refines QA test cases into a structured plan.');
  });

  it('parses a literal (|) block scalar preserving line breaks', () => {
    const md = ['---', 'description: |', '  line one', '  line two', '---'].join('\n');
    expect(parseFrontmatter(md).description).toBe('line one\nline two');
  });

  it('strips surrounding quotes from scalar values', () => {
    const md = ['---', 'name: "quoted-name"', "description: 'single quoted'", '---'].join('\n');
    expect(parseFrontmatter(md)).toMatchObject({
      description: 'single quoted',
      name: 'quoted-name',
    });
  });

  it('ignores nested mappings without crashing', () => {
    const md = [
      '---',
      'name: my-skill',
      'metadata:',
      '  type: skill',
      '  nested: value',
      'description: top level',
      '---',
    ].join('\n');
    const fm = parseFrontmatter(md);
    expect(fm.name).toBe('my-skill');
    expect(fm.description).toBe('top level');
    expect(fm.type).toBeUndefined();
  });

  it('returns empty when the frontmatter block is unterminated', () => {
    expect(parseFrontmatter('---\nname: x\nno closing fence')).toEqual({});
  });

  it('tolerates a leading BOM', () => {
    const md = `${String.fromCharCode(0xfeff)}${['---', 'name: bom-skill', '---'].join('\n')}`;
    expect(parseFrontmatter(md).name).toBe('bom-skill');
  });
});
