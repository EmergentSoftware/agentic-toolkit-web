# Bundle README follow-ups

Handoff notes from the fix for GitHub issue #4 ("README not shown on bundle page"),
shipped in https://github.com/EmergentSoftware/agentic-toolkit-web/pull/5 on 2026-09-11.
Each section below is self-contained so it can be picked up in a fresh session with no
other context. They are independent of each other and live in three different repos.

| # | Follow-up | Repo | Effort |
|---|-----------|------|--------|
| 1 | Add a README editor to the web Create Bundle wizard | `agentic-toolkit-web` | medium |
| 2 | Include the bundle's own `README.md` in the bundle zip | `Emergent.AgenticToolkit/apps/api` | small |
| 3 | Stop pointing `atk info` README links at GitHub blob URLs | `agentic-toolkit-cli` | small–medium |

## Background (what PR #5 established)

- A bundle version in the registry is a directory `bundles/[@org/]{name}/{version}/` holding
  `bundle.json` and, optionally, `README.md`. `setupInstructions` is a *field inside*
  `bundle.json`; the README is a *sibling file*. They are different things.
- The API (`apps/api/src/Atk.Api/Functions/RegistryFunctions.cs`, `GetBundleReadme`) serves the
  README from `GET /bundles/{name}/{version}/readme?org=` as `text/markdown`, 404 when absent.
- The CLI publishes `README.md` next to `bundle.json` (`agentic-toolkit-cli/src/lib/publisher.ts`,
  file collection ~line 900, payload filter ~line 186 "Bundles may only add README.md").
- The web app now fetches and renders it: `fetchBundleReadme` in `src/lib/registry-client.ts`,
  `useBundleReadme` in `src/hooks/useBundleReadme.ts`, and the shared
  `src/components/ReadmeSection.tsx` used by both `AssetDetail.tsx` and `BundleDetail.tsx`.
- Registry state on 2026-09-11: 3 of 7 bundles have a README (`@cupay/post-meeting-workflow`,
  `@cupay/qa-bundle`, `cupay-post-meeting-workflow`). The four without were all published from the
  web wizard, which is follow-up 1.

---

## 1. Web: Create Bundle wizard has no README editor

### Problem

`src/routes/CreateBundle.tsx` line 287 calls `publishBundle({ …, readme: '' })`. The wizard
collects `setupInstructions` (Step 3, "Setup") but never a README, so every bundle published from
the web ships without `README.md`. The issue reporter worked around this by pasting README
content into setup instructions, which is what confused their agent.

The publish path already supports a README: `buildBundlePublishRequest` in
`src/lib/publish-service.ts` (line ~141) appends `README.md` to the payload whenever `readme`
is non-empty. Only the UI is missing.

### Reference implementation to mirror

The asset Contribute wizard already has exactly this step. In `src/routes/Contribute.tsx`:

- draft field `readme: string` (line 42), initial `''` (line 78), zod `readme: z.string()` (line 94)
- step definition `{ description: 'Write or edit the README', id: 'readme', title: 'README' }` (line 63)
- the editor UI at ~lines 970–1000: a `Textarea` (`data-testid='field-readme'`, id `contrib-readme`)
  beside a live `MarkdownRenderer` preview (`data-testid='readme-preview'`)
- `readme: draft.readme` passed to publish (line 297)

The bundle wizard's existing Setup step (`CreateBundle.tsx` ~lines 838–860, `data-testid='field-setup'`)
uses the same Textarea + preview layout, so the README step can be a near copy of it.

### Proposed change

1. **Draft state** (`CreateBundle.tsx`):
   - add `readme: string` to `BundleDraftState` (line 42) and `createInitialBundleDraft` (line 84, `readme: ''`)
   - add `readme?: string` to `CreateBundleSeed` (line 57) and hydrate it in the seed branch (~line 205,
     next to `setupInstructions: seed.setupInstructions ?? ''`)
   - the persisted-draft schema around line 113 (`setupInstructions: z.string()`) needs `readme: z.string()`;
     `loadBundleDraftFromStorage` (line 385) should tolerate old drafts without the key (default `''`)
   - `buildBundleInput` (line 132) must **not** put `readme` into `bundle.json`; README is a file, not a field.
2. **Step**: insert a README step into `STEPS` (line 73). Suggested order: Metadata → Assets → README →
   Setup → Review, with description "Describe the bundle (optional, markdown)". Update
   `getStepValidity` (line 410) so the new step is optional like Setup. Watch the persisted `step` index
   bound (`.max(STEPS.length - 1)`, line 118).
3. **Editor UI**: copy the Setup step block, using `data-testid='field-readme'`, id `bundle-readme`,
   `onChange('readme', …)`, and a `MarkdownRenderer` preview labelled "README preview". Make it clear in
   the section description that README is the bundle's overview page and Setup is post-install steps.
4. **Review step**: show a "README: provided / none" row so the user sees what will be published.
5. **Publish**: replace `readme: ''` (line 287) with `readme: draft.readme`.
6. **Edit / new version seed** (`src/routes/BundleDetail.tsx`, `editNewVersion` ~line 52): pass the
   current README so a new version starts from the existing one. `BundleDetailRoute` already has
   `readmeQuery` from PR #5; add `...(readmeQuery.data ? { readme: readmeQuery.data } : {})` to the seed.

### Tests

- `src/__tests__/routes/CreateBundle.test.tsx` (6 cases today; step walk-through is around line 148):
  extend the happy path to type into `field-readme`, assert the preview renders, and assert the
  publish call receives `readme` with the typed content. Add a case proving `bundle.json` in the
  payload has no `readme` key.
- `src/__tests__/lib/publish-service.test.ts`: `buildBundlePublishRequest` already has coverage for
  the README file being appended; confirm it still passes.
- `src/__tests__/routes/BundleDetail.test.tsx`: the "Edit / New version" navigation test (if present)
  should assert the seed carries `readme` when the README query has data.

### Verification

`pnpm lint && pnpm typecheck && pnpm test`, then `pnpm dev` against the dev API, create a bundle
with a README via **Contribute → dry run** (dry run creates no PR) and check the dry-run payload
lists `README.md`.

---

## 2. API: bundle zip omits the bundle's own README.md

### Problem

`apps/api/src/Atk.Api/Archive/ArchiveBuilder.cs`, `BuildBundleArchiveAsync` (~lines 50–81) writes
`bundle.json` at the zip root and then each member under `{member}/…`, but never adds the bundle
directory's `README.md`. Asset zips do include the asset README (it is only stripped for
`format=skill` via `SkillExcludedFiles`, line ~33). So a downloaded bundle zip loses the
documentation that the web page now shows.

### Proposed change

In `BuildBundleArchiveAsync`, inside the `if (format != ArchiveFormat.Skill)` block that writes
`bundle.json`, also try to read the bundle README and write it at the root when present:

```csharp
var readme = await registry.TryReadFileAsync(bundle.Directory, RegistryPaths.ReadmeFileName, cancellationToken).ConfigureAwait(false);
if (readme is not null)
{
    await WriteEntryAsync(zip, RegistryPaths.ReadmeFileName, readme, cancellationToken).ConfigureAwait(false);
}
```

`TryReadFileAsync` (returns null when missing) is the same call `GetBundleReadme` uses in
`RegistryFunctions.cs`. Keep the `.skill` format unchanged: it deliberately drops manifests and
READMEs. Check `WriteEntryAsync` overloads accept the byte[]/string type `TryReadFileAsync` returns.

Also update the `ArchiveBuilder` class doc comment (the `<list>` at the top of the file) to say the
bundle zip includes `README.md` at the root when the bundle has one.

### Tests

`apps/api/tests/Atk.Api.Tests/Archive/ArchiveBuilderTests.cs`:

- extend the fake registry files (see line ~16, `["assets/skills/with-dep/1.0.0/README.md"] = "readme"`)
  with `["bundles/@acme/acme-bundle/1.0.0/README.md"] = "bundle readme"` (or whichever bundle the
  fixture defines)
- in `BuildBundleArchiveAsync_Zip_PutsBundleJsonAtRootAndMembersInFolders` (line ~75) assert
  `README.md` is present at the root with that content
- add a case for a bundle without a README asserting no root `README.md` entry and no exception
- in `BuildBundleArchiveAsync_Skill_NestsSkillMembersAsSkillArchives` (line ~91) assert the root
  README is absent

Run `dotnet test apps/api` from the monorepo root. If the OpenAPI summary for
`DownloadBundle` describes the zip layout, update it in `OpenApiDocumentBuilder.cs` and then in the
two consumers run `pnpm refresh-openapi && pnpm generate-api` (web) / the CLI equivalent. This is
doc-only; the response shape does not change.

---

## 3. CLI: `atk info` README links point at GitHub blob URLs

### Problem

`src/commands/info.tsx` shows a README *link*, not the README, for both bundles (line 254 and the
JSON output at line 337) and assets (line 351). The link comes from
`src/lib/registry-repo.ts` `buildBundleReadmeUrl` / `buildReadmeUrl` (lines ~22–40) and is a hard-coded
`https://github.com/{DEFAULT_REGISTRY_REPO}/blob/{branch}/bundles/…/README.md`.

Two problems:

- The registry is moving off GitHub to Azure Repos behind the ATK API (see
  `Emergent.AgenticToolkit/docs/Direction.md`). Once that lands the links 404.
- The CLI already has an API-backed way to get README content: `fetchOptionalReadme` in
  `src/lib/registry.ts` (~line 611), used by `fetchAssetManifest`, which returns `readmeContent`
  for both assets and bundles (bundle branch ~line 187). `info` just doesn't use it.

### Proposed change (pick one; the first is recommended)

**A. Render the README in `atk info` (recommended).**
- Fetch the README via the existing `fetchOptionalReadme` path in the `info` data loader (the
  `bundle_found` / `found` outcomes) and add `readme?: string` to the outcome data.
- In the Ink views (`BundleDetail` component in `info.tsx` and the asset equivalent), render the
  markdown source under a "README" heading, truncated to N lines with a `--full` (or `--readme`)
  flag to show all. Keep JSON output stable by adding `readme` alongside the existing `readmeUrl`.
- Replace `readmeUrl` with an API URL (`{apiBase}/bundles/{name}/{version}/readme?org=`) or drop it
  once the GitHub registry is gone. Do the removal in a separate, clearly-labelled change since
  `readmeUrl` is part of the JSON contract.

**B. Minimal: only fix the URL.**
- Point `buildBundleReadmeUrl` / `buildReadmeUrl` at the API README endpoints instead of GitHub.
  Cheap, but the link needs a bearer token to open in a browser, so it is less useful than A.

### Tests

- `src/__tests__/commands/info.test.tsx` (exists; search for `readmeUrl` and `bundle_found` cases):
  add cases for README present (rendered/truncated) and absent (no README section), plus the JSON
  shape.
- `src/__tests__/lib/registry-repo.test.ts` if the URL builders change.

Run `pnpm test` in `agentic-toolkit-cli`; try `atk info @cupay/qa-bundle` against dev
(it has a README) and `atk info feature-workflow` (it does not).

---

## Repo gotchas worth knowing before starting

- **Web repo Prettier and line endings**: on this Windows checkout `pnpm format` rewrites ~100
  untouched files from CRLF to LF, and `pnpm format:check` already fails on `main` (27 files).
  Run `npx prettier --check <your files>` instead of the repo-wide script, and `git add` files
  explicitly. Line-ending-only noise clears with `rm <file> && git checkout -- <file>`.
- **Web tests** mock hooks with `vi.hoisted` + `vi.mock('@/hooks/…')` and stub `fetch` with
  `src/__tests__/utils/api-stub.ts`. There is no MSW.
- **Web lint** uses `perfectionist` natural sorting: imports, object keys, JSX props, interface
  members, and top-level functions (exported first) must be alphabetised or `pnpm lint` fails.
- **API contract changes** require `pnpm refresh-openapi && pnpm generate-api` in the web repo
  (and the CLI's equivalent); `src/lib/api/**` is generated and lint-ignored, never hand-edit it.
