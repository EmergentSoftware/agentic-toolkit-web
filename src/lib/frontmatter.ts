/**
 * Minimal YAML frontmatter parser scoped to what the contribute wizard needs:
 * top-level scalar keys (notably `name` and `description`) from a `SKILL.md`
 * header. It deliberately supports the one structure a naive regex cannot —
 * block scalars (`>` folded and `|` literal), which Claude desktop emits for
 * long descriptions — while ignoring nested mappings and sequences. It is not a
 * general YAML implementation.
 */

export interface Frontmatter {
  [key: string]: string;
}

/**
 * Parse the leading `---` frontmatter block of a markdown document into a flat
 * map of top-level scalar string values. Returns an empty object when no
 * frontmatter block is present.
 */
export function parseFrontmatter(markdown: string): Frontmatter {
  const result: Frontmatter = {};
  const normalized = markdown.replace(/^\uFEFF/, '');
  const lines = normalized.split(/\r?\n/);
  if (lines[0]?.trim() !== '---') return result;

  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === '---' || trimmed === '...') {
      end = i;
      break;
    }
  }
  if (end === -1) return result;

  const body = lines.slice(1, end);
  let i = 0;
  while (i < body.length) {
    const line = body[i];
    if (line.trim() === '' || line.trimStart().startsWith('#')) {
      i++;
      continue;
    }
    const match = /^(\s*)([A-Za-z0-9_-]+):\s?(.*)$/.exec(line);
    if (!match) {
      i++;
      continue;
    }
    const keyIndent = match[1].length;
    const key = match[2];
    const rest = match[3];

    const blockMatch = /^([|>])([+-]?)\s*$/.exec(rest.trim());
    if (blockMatch) {
      const folded = blockMatch[1] === '>';
      const collected: string[] = [];
      let blockIndent = -1;
      i++;
      while (i < body.length) {
        const bl = body[i];
        if (bl.trim() === '') {
          collected.push('');
          i++;
          continue;
        }
        if (indentOf(bl) <= keyIndent) break;
        if (blockIndent === -1) blockIndent = indentOf(bl);
        collected.push(bl.slice(blockIndent));
        i++;
      }
      result[key] = foldBlock(collected, folded);
      continue;
    }

    if (rest === '') {
      // Nested mapping or sequence — skip the key and its indented children.
      i++;
      while (i < body.length && (body[i].trim() === '' || indentOf(body[i]) > keyIndent)) i++;
      continue;
    }

    result[key] = unquote(rest.trim());
    i++;
  }

  return result;
}

function foldBlock(lines: string[], folded: boolean): string {
  const trimmed = [...lines];
  while (trimmed.length > 0 && trimmed[trimmed.length - 1] === '') trimmed.pop();
  if (!folded) return trimmed.join('\n');

  let out = '';
  for (const line of trimmed) {
    if (line === '') {
      out += '\n';
      continue;
    }
    out += out === '' || out.endsWith('\n') ? line : ` ${line}`;
  }
  return out;
}

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

function unquote(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if (first === last && (first === '"' || first === "'")) {
      const inner = value.slice(1, -1);
      return first === '"' ? inner.replace(/\\"/g, '"') : inner.replace(/''/g, "'");
    }
  }
  return value;
}
