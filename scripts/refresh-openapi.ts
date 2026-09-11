/**
 * Download the ATK API's OpenAPI contract into `openapi/openapi.json`.
 *
 * Usage: `pnpm refresh-openapi` (defaults to the dev API) or
 *        `ATK_API_URL=https://func-atk-prod.azurewebsites.net pnpm refresh-openapi`.
 *
 * Run `pnpm generate-api` afterwards to regenerate `src/lib/api/`.
 */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const baseUrl = (process.env['ATK_API_URL'] ?? 'https://func-atk-dev.azurewebsites.net').replace(/\/$/, '');
const url = `${baseUrl}/openapi.json`;
const target = join(process.cwd(), 'openapi', 'openapi.json');

const response = await fetch(url);
if (!response.ok) {
  throw new Error(`Failed to download ${url}: HTTP ${response.status}`);
}

const spec = (await response.json()) as Record<string, unknown>;
await writeFile(target, JSON.stringify(spec, null, 2) + '\n', 'utf-8');
console.log(`Wrote ${target} from ${url} (info.version ${(spec['info'] as { version?: string })?.version ?? '?'})`);
