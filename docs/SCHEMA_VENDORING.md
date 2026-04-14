# Schema Vendoring

The Zod schemas under `src/lib/schemas/` are **vendored** from the CLI repository. They are the single source of truth for ATK's data models (manifests, bundles, lockfiles, registry, adapters, config) and live upstream at:

- Upstream repo: [`EmergentSoftware/agentic-toolkit`](https://github.com/EmergentSoftware/agentic-toolkit)
- Upstream path: `src/lib/schemas/`

## Why vendor?

The web app needs runtime validation of registry data that is produced and consumed by the CLI. Publishing the CLI schemas as a shared package would create a multi-repo release treadmill; copying the files gives us type-for-type parity with an easy refresh path and zero cross-repo publish coupling.

## What is copied

All `.ts` files in `src/lib/schemas/` upstream, including the `index.ts` barrel:

- `adapter.ts`
- `bundle.ts`
- `config.ts`
- `index.ts`
- `lockfile.ts`
- `manifest.ts`
- `registry.ts`

## What is changed during sync

The upstream repo compiles with `NodeNext` module resolution and uses explicit `.js` import suffixes (e.g., `from './manifest.js'`). This project uses `bundler` module resolution, so those suffixes must be stripped. The sync script rewrites every intra-schema `.js` import automatically.

No other edits are permitted. If a schema needs to diverge, fix it upstream first.

## How to refresh

1. Check out `agentic-toolkit` as a sibling directory next to this repo (i.e. `../agentic-toolkit/`).
2. Pull the version of the schemas you want to vendor.
3. From this repo, run:

   ```sh
   pnpm sync-schemas
   ```

4. Review the diff, run `pnpm typecheck` and `pnpm test`, and commit the result with a message referencing the upstream commit.

## Policy

- Do **not** hand-edit vendored files. Edit upstream and re-sync.
- Do **not** import from vendored files outside of `src/lib/`. Other layers should depend on hooks / clients that already encapsulate the schemas.
- If upstream adds new schema files, update the sync script only if the rewriting logic changes; the script copies every `.ts` in the directory automatically.
