import { defineConfig } from '@hey-api/openapi-ts';

/**
 * Generates the ATK API client from the vendored contract in `openapi/openapi.json`.
 *
 * - `pnpm refresh-openapi` re-downloads the contract from the API.
 * - `pnpm generate-api` regenerates `src/lib/api/` (committed; do not edit by hand).
 *
 * Only `src/lib/api-client.ts` may import the generated default client.
 */
export default defineConfig({
  input: './openapi/openapi.json',
  output: {
    path: 'src/lib/api',
    postProcess: [],
  },
  plugins: [
    { name: '@hey-api/client-fetch', throwOnError: false },
    { name: '@hey-api/sdk', operations: { strategy: 'flat' }, responseStyle: 'fields', throwOnError: false },
    { name: '@hey-api/typescript', enums: false },
  ],
});
