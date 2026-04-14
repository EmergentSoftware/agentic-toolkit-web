/**
 * Sync vendored Zod schemas from a sibling `agentic-toolkit` checkout.
 *
 * Copies every *.ts file from ../agentic-toolkit/src/lib/schemas/ into
 * src/lib/schemas/ and rewrites any intra-schema `./foo.js` imports to
 * `./foo` so the bundler-resolution TypeScript config here is happy.
 *
 * Usage: pnpm sync-schemas
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, '..');
const SOURCE_DIR = path.resolve(WEB_ROOT, '..', 'agentic-toolkit', 'src', 'lib', 'schemas');
const DEST_DIR = path.resolve(WEB_ROOT, 'src', 'lib', 'schemas');

function rewriteJsImports(source: string): string {
  return source.replace(/(from\s+['"])(\.\.?\/[^'"]+?)\.js(['"])/g, '$1$2$3');
}

function main(): void {
  if (!existsSync(SOURCE_DIR)) {
    console.error(`Source schemas directory not found: ${SOURCE_DIR}`);
    console.error('Expected a sibling checkout of agentic-toolkit next to this repo.');
    process.exit(1);
  }

  mkdirSync(DEST_DIR, { recursive: true });

  const entries = readdirSync(SOURCE_DIR, { withFileTypes: true });
  const tsFiles = entries.filter((e) => e.isFile() && e.name.endsWith('.ts'));

  if (tsFiles.length === 0) {
    console.error(`No .ts files found in ${SOURCE_DIR}`);
    process.exit(1);
  }

  for (const entry of tsFiles) {
    const sourcePath = path.join(SOURCE_DIR, entry.name);
    const destPath = path.join(DEST_DIR, entry.name);
    const original = readFileSync(sourcePath, 'utf8');
    const rewritten = rewriteJsImports(original);
    writeFileSync(destPath, rewritten);
    console.log(`synced ${entry.name}${rewritten === original ? '' : ' (rewrote .js imports)'}`);
  }

  console.log(`\nSynced ${tsFiles.length} schema file(s) from ${SOURCE_DIR}`);
}

main();
