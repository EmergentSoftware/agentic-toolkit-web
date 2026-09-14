import { defineConfig } from '@hey-api/openapi-ts';

/**
 * Generates the ATK API client from the vendored contract in `openapi/openapi.json`.
 *
 * - `pnpm refresh-openapi` re-downloads the contract from the API.
 * - `pnpm generate-api` regenerates `src/lib/api/` (committed; do not edit by hand).
 *
 * The generated default client (`client.gen.ts`) is created without a base URL
 * on purpose: every SDK call must go through `src/lib/api-client.ts`, which
 * sets the base URL and auth. ESLint blocks importing `client.gen` elsewhere.
 */
export default defineConfig({
  input: './openapi/openapi.json',
  output: {
    path: 'src/lib/api',
    postProcess: [],
  },
  plugins: [
    { baseUrl: false, name: '@hey-api/client-fetch', throwOnError: false },
    { name: '@hey-api/sdk', operations: { strategy: 'flat' }, responseStyle: 'fields', throwOnError: false },
    { name: '@hey-api/typescript', enums: false },
  ],
});
