# Agentic Toolkit Web — Phased Implementation Plan

This document breaks the ATK Web MVP into ordered phases. Each phase delivers a testable slice of functionality and must be validated before the next phase begins. The ordering deliberately front-loads foundational, auth-free work so early phases can be developed and tested against fixture data, then layers authentication and contribution workflows on top once the read-only surface is stable.

Resolved decisions informing this plan (from PROJECT_OVERVIEW.md §10):

- **Schemas:** vendor-copied from `agentic-toolkit` into this repo for MVP.
- **Download format:** zip (client-side packaging) — single universal code path.
- **Releases:** trunk-based deploy-on-merge; no `semantic-release`.
- **Auth function:** in-repo under `/auth-function`.
- **Bundles:** read-only browse/download in MVP; no bundle authoring.

---

## Phase 0 — Repository & Tooling Bootstrap

**Objective.** Stand up an empty-but-correctly-wired repository that lints, type-checks, tests, and serves a hello-world SPA.

**Scope.**
- Initialize a Vite + React 19 + TypeScript (strict) project.
- Install and configure Tailwind CSS and shadcn/ui (with the Base UI integration) along with `lucide-react` for icons.
- Configure ESLint and Prettier to match the `agentic-toolkit` CLI repo's conventions.
- Configure Vitest and `@testing-library/react`.
- Configure HashRouter at the app root (chosen for GitHub Pages deep-link compatibility).
- Establish the repository layout from §9 of the overview, including empty `docs/`, `src/components/`, `src/routes/`, `src/lib/`, `src/hooks/`, and `auth-function/` directories.
- Add a minimal CI workflow that runs lint, typecheck, and test on pull requests.
- Add a `develop` → `main` branch model to match sibling ATK repos.

**Validation.**
- `pnpm dev` serves a hello-world page rendered via React Router.
- Lint, typecheck, and Vitest all pass on a fresh clone.
- Pull-request CI runs and blocks on failure.

---

## Phase 1 — Schema Vendoring & Registry Data Layer

**Objective.** Establish the read-only data layer that all subsequent browse and detail work depends on. No UI yet — this phase is libraries and tests.

**Scope.**
- Copy the Zod schemas from `agentic-toolkit/src/lib/schemas/` into `src/lib/schemas/` in this repo, preserving the barrel exports so registry, manifest, bundle, lockfile, adapter, and config schemas are all available.
- Document the vendoring source and a policy for keeping the copies in sync with the CLI repo.
- Implement a registry client module that fetches `registry.json` from the `EmergentSoftware/agentic-toolkit-registry` repository via the GitHub Contents API, parses it against the vendored Zod schema, and surfaces typed errors on malformed data.
- Integrate TanStack Query as the fetching and caching layer; define query keys for the registry index, individual asset manifests, and individual bundle manifests.
- Provide a fixture registry (a committed test artifact mirroring a small slice of the real registry) to drive development and tests before authentication exists.
- Implement a fetch-retry and error-surface helper aligned with the CLI's behavior so transient GitHub API errors degrade gracefully.

**Validation.**
- Unit tests confirm the registry client parses the fixture into the expected shape.
- Unit tests confirm malformed fixtures produce readable, typed errors.
- Query caching behaves as expected in tests (hits, misses, refetch on invalidate).

---

## Phase 2 — App Shell, Routing & Design System Baseline

**Objective.** Establish the navigational skeleton, visual language, and shared layout primitives that every page will inherit.

**Scope.**
- Define the route map: Sign-in, Browse (default authenticated landing), Asset Detail, Bundle Detail, Contribute, and a Not-authorized screen for non-EmergentSoftware users.
- Build a top-level `AppLayout` with a header (brand, nav, user affordance placeholder), a main content area, and a footer.
- Build shared primitives: page header, section header, empty-state component, loading indicator, error boundary, and toast/notification surface.
- Establish typography, spacing, and color tokens via Tailwind and shadcn theme configuration.
- Stub each route with a placeholder page that renders its title and a short description, so navigation can be exercised end-to-end visually.
- Add a `NotFound` route.

**Validation.**
- Manually navigating between every route works via the nav and via direct hash URLs.
- Component tests for the layout, error boundary, and empty-state primitives pass.
- Visual review confirms consistent spacing, typography, and dark/light handling if applicable.

---

## Phase 3 — Browse View (Assets)

**Objective.** Deliver the flagship browse experience against fixture data. This phase proves the data layer, the design system, and the primary user journey all work together.

**Scope.**
- Build the Browse page as a TanStack Table over the registry asset list.
- Columns: name, type, short description, version, tags, trust level, org scope, compatibility, and a placeholder Download action cell.
- Filters: asset type (skill / agent / rule / hook / memory / MCP), tag multi-select, tool compatibility, trust level, and an org-vs-global toggle.
- A free-text search box that filters across name, description, and tags with simple relevance ordering consistent with the CLI's search behavior.
- Column visibility controls and persistent sort.
- Responsive layout down to tablet; mobile can render as cards if the table is unwieldy at small widths.
- Empty state when filters produce no results; loading state while the query is inflight; error state on fetch failure.
- Clicking a row navigates to the Asset Detail route (to be built in Phase 4).

**Validation.**
- Component tests cover each filter, the search box, sorting, and empty/loading/error states.
- Manual QA confirms every fixture asset can be found via at least one filter path.
- Accessibility check: table is keyboard-navigable; filter controls have labels.

---

## Phase 4 — Asset Detail View & README Rendering

**Objective.** Render a single asset's full metadata and its README clearly enough that a non-technical user can decide whether to download it.

**Scope.**
- Build the Asset Detail page keyed on the asset identifier from the URL.
- Display the full manifest: name, type, version, author, trust level, tags, tool compatibility matrix, org scope, security-review status, dependencies (read-only list, names only — no resolution), and timestamps.
- Fetch and render the asset's README as Markdown. Select a Markdown renderer that supports GFM (tables, task lists, fenced code with basic highlighting) and sanitize output.
- Display a prominent primary action area reserved for the Download button (implemented in Phase 5).
- Handle the asset-not-found case with a friendly message and a link back to Browse.
- Deep-link support: pasting an asset URL directly into the browser lands on the correct asset.

**Validation.**
- Component tests confirm manifest fields render correctly and missing optional fields degrade gracefully.
- Markdown rendering test covers headings, code blocks, tables, lists, and links.
- Manual QA from Browse → Detail → back preserves filter and scroll state where reasonable.

---

## Phase 5 — Download Flow (Zip)

**Objective.** Deliver the "Download" button end-to-end for a single asset. This completes the read-side MVP user journey for a non-contributing user.

**Scope.**
- Integrate `jszip` for client-side zip packaging.
- Implement a download service that, given an asset identifier, fetches every file that belongs to the asset from the registry repository via the GitHub Contents API, packages the files into a zip preserving folder structure, and triggers a browser download.
- Preserve the asset's manifest file verbatim in the zip so the download is round-trippable into the CLI.
- Show progress while files are being fetched and packaged; show a success toast on completion and an error toast on failure.
- Wire the Download button on both the Browse table row and the Asset Detail page to this service.
- Handle transient failures with the shared fetch-retry helper.

**Validation.**
- Integration test: invoking the download service against the fixture produces a zip containing the expected file list and manifest.
- Manual QA across Chromium, Firefox, and Safari confirms the download lands on disk.
- Error-path QA: simulated GitHub API failure surfaces a readable error to the user.

---

## Phase 6 — Bundle Browsing & Detail (Read-Only)

**Objective.** Extend the browse and detail surfaces to cover bundles, matching the MVP's read-only bundle scope.

**Scope.**
- Add bundles to the Browse view, either as a toggle between Assets and Bundles or as a dedicated Bundles route — whichever reads more cleanly to a non-technical user.
- Implement a Bundle Detail view showing the bundle's metadata and its member asset list, with each member linking to its Asset Detail page.
- Extend the download flow to support downloading a bundle as a single zip that contains every member asset in its own subfolder plus the bundle manifest.
- No bundle authoring in MVP; the Contribute flow remains asset-only.

**Validation.**
- Component tests for bundle table rendering and bundle detail rendering.
- Integration test confirms a downloaded bundle zip contains all member assets and the bundle manifest.
- Manual QA: browse → bundle detail → member asset detail → back preserves context.

---

## Phase 7 — Azure Function for OAuth Token Exchange

**Objective.** Ship the minimum server-side surface needed to complete GitHub OAuth from a browser. This phase is standalone — it does not touch the SPA.

**Scope.**
- Scaffold the Node.js/TypeScript Azure Function in `auth-function/` with a single HTTP-triggered endpoint: `POST /api/auth/exchange`.
- The endpoint accepts an OAuth `code`, exchanges it with GitHub's `/login/oauth/access_token` endpoint using a stored `client_secret`, and returns the resulting access token to the caller.
- Configure application settings for the OAuth client ID and secret; secrets live in Function App settings, never in source.
- Configure CORS to restrict calls to the deployed GitHub Pages origin and a localhost origin for development.
- Add input validation, structured error responses, and a minimal access log that omits tokens.
- Register a dev GitHub OAuth App for the non-production environment, with its callback URL pointing at the localhost SPA, so the function can be tested end-to-end during development.
- Add lint, typecheck, and test scripts for the function package and include it in CI.

**Validation.**
- Unit tests cover the success path, GitHub error responses, bad-input rejections, and CORS preflight behavior.
- Local integration test using Azure Functions Core Tools plus a live round-trip against GitHub's OAuth endpoints (via the dev OAuth App) produces an access token.
- Security review: no token or secret appears in logs, error responses, or CORS-reflected headers.

---

## Phase 8 — SPA Authentication & Org Membership Gate

**Objective.** Wire sign-in, session management, and the EmergentSoftware membership check into the SPA. After this phase, every authenticated feature in later phases can assume a verified org member and a valid Octokit client.

**Scope.**
- Implement the GitHub OAuth redirect flow: Sign-in button initiates the authorize redirect with the required scopes (`read:org`, `repo`); callback route extracts the `code` and POSTs it to the auth function; resulting token is stored in `sessionStorage`.
- Implement a session hook/provider that exposes the current token, the authenticated user's login, and a sign-out action. Tokens are never persisted beyond `sessionStorage`.
- Instantiate an authenticated Octokit client from the session and use it for all GitHub API calls henceforth.
- Immediately after sign-in, call `GET /orgs/EmergentSoftware/members/{username}` and gate entry to the app on success.
- Build the non-member blocking screen with friendly copy and guidance for requesting access.
- Build the signed-out landing page that introduces the app and surfaces the Sign-in button.
- Update the registry data layer so authenticated reads use the session's Octokit client — this is when the app transitions off fixture data onto the live registry (assuming the registry remains private).
- Add route guards: Browse, Detail, Bundle Detail, and Contribute require an authenticated org member; unauthenticated users are redirected to Sign-in.

**Validation.**
- Component tests cover the signed-out, signed-in-pending-check, signed-in-member, and signed-in-non-member states.
- Manual end-to-end test: fresh session signs in, passes org check, lands on Browse, reloads the page and stays signed in for the session, signs out and sessionStorage is cleared.
- Manual end-to-end test with a GitHub account that is not a member of EmergentSoftware lands on the blocking screen.
- Manual QA confirms live registry reads replace fixtures cleanly and all Phase 3–6 features still work against production data.

---

## Phase 9 — Contribute Form UX

**Objective.** Build the full contribute form — every field, validation rule, and preview — short of actually submitting to GitHub. This isolates UX risk from integration risk.

**Scope.**
- New Contribute route, reached from the top navigation and guarded by the Phase 8 auth check.
- A guided, multi-step form built with TanStack Form:
  1. Asset type selector (skill, agent, rule, hook, memory, MCP).
  2. Folder/file upload via drag-and-drop and a file picker, with clear feedback on which files were accepted and a per-file remove affordance.
  3. Metadata: name, short description, tags (multi-add), org scope (user's org vs. global, subject to what they have access to).
  4. README editor with a live Markdown preview mirroring the Phase 4 renderer.
- Validate every field against the vendored Zod manifest schema so the web app accepts exactly what the CLI would accept.
- Generate the asset manifest from form values and show a read-only review step before submission.
- Show a "Submit" button in the review step that is disabled until validation passes; wire it to a stub that logs the prepared payload — no GitHub call yet.
- Preserve in-progress form state across accidental navigations within the SPA.

**Validation.**
- Form unit tests cover each validation rule and the happy path through every step.
- Manual QA: a non-technical user can complete the form end-to-end without reading documentation.
- Accessibility: every form control has a label, the stepper is keyboard-navigable, and errors are announced to assistive tech.

---

## Phase 10 — Publish Pipeline (Fork → Branch → Commit → PR)

**Objective.** Turn the Phase 9 stub into a real publishing flow that mirrors `atk publish`: fork the registry, push a branch, open a PR, and present a confirmation linking to it.

**Scope.**
- Build an Octokit-based publish service with the following steps:
  1. Detect whether the signed-in user already has a fork of `EmergentSoftware/agentic-toolkit-registry`; if not, create one and wait for it to be ready.
  2. Create a contribution branch on the fork with a deterministic, collision-resistant name (e.g. asset type, asset name, and a timestamp).
  3. Commit the asset files and generated manifest to the branch.
  4. Open a pull request from the fork branch back to the registry's default branch with a descriptive title and body matching the CLI's convention.
- Show progress through each step with clear, non-technical copy (e.g. "Preparing your workspace", "Uploading your files", "Opening your pull request").
- On success, render a success screen with a direct link to the opened PR and messaging that the contribution will be reviewed by a maintainer before it appears in the registry. Include a "Contribute another" affordance that returns to the empty form.
- Handle the common failure cases with readable errors: GitHub rate limit, insufficient permissions, fork already has a conflicting branch, registry default branch changed, and network failures. Each error message explains what the user can try next.
- Add a dry-run toggle (hidden behind an internal-only query string or build flag) that walks every step short of the final PR creation, for use during QA and early testing.

**Validation.**
- Unit tests cover the service logic with mocked Octokit responses for each failure case.
- End-to-end test against a sandbox fork of the registry confirms a submission produces a real PR with the expected branch, files, and title.
- Manual QA with the dry-run toggle confirms the service progresses through all steps and reports status correctly.
- Post-submission, confirm the registry's existing security-review pipeline runs on the opened PR.

---

## Phase 11 — Deployment Pipelines

**Objective.** Make the MVP reachable at a public URL, with both the web app and the auth function deploying automatically from `main`.

**Scope.**
- GitHub Actions workflow to build the Vite app and publish to GitHub Pages on every push to `main`. Include cache steps and fail-on-lint/test guards.
- GitHub Actions workflow to deploy the `auth-function/` package to Azure on every push to `main`, authenticated via a service principal stored as a repository secret. Configure separate deploy slots or environments for dev and production if needed.
- Register the production GitHub OAuth App under the EmergentSoftware org with the production Pages URL as the callback.
- Configure the production Function App's application settings with the production OAuth client ID and secret, and restrict CORS to the production Pages origin.
- Pin the SPA's build-time OAuth client ID and auth-function URL via environment variables injected at build time.
- Document how to rotate the OAuth client secret and how to roll back a bad deploy.

**Validation.**
- Push-to-`main` produces a successful Pages deploy observable at the production URL.
- Push-to-`main` produces a successful Azure deploy observable by hitting the function's health check.
- Sign-in against the production OAuth App completes successfully end-to-end.
- Running through the full success-criteria checklist (§11 of the overview) against the deployed site passes every item.

---

## Phase 12 — Polish, Accessibility, and MVP Acceptance

**Objective.** Close remaining gaps and ensure the product is ready for the non-technical audience it is built for.

**Scope.**
- Accessibility pass: keyboard traversal on every page, focus visibility, color contrast, ARIA labeling on custom controls, and automated axe checks in CI.
- Responsive pass down to common mobile widths for Browse, Detail, and the Contribute form.
- Copy review targeting a non-technical reader: remove developer jargon, clarify trust-level and org-scope labels, and polish empty-state and error messaging.
- Performance pass: measure and trim the production bundle; confirm initial load, browse filter, and download start all feel responsive.
- End-to-end walkthrough against each MVP success criterion from §11 of the overview, documenting results.
- Author a short README for the repository covering local development, environment variables, deployment, and how to rotate the OAuth secret.
- Author a short contributor guide covering how to vendor-sync the Zod schemas from `agentic-toolkit` when they change.

**Validation.**
- Every item in the §11 success-criteria checklist passes on the deployed site with a test account.
- Automated accessibility checks pass in CI on every PR.
- A non-technical stakeholder can complete browse → download and browse → contribute flows unassisted.

---

## Cross-Cutting Concerns

These apply continuously from Phase 0 onward; they are not separate phases.

- **Testing discipline.** Every phase ships its own tests; no phase is considered complete if it regresses earlier phases' tests.
- **Schema parity with the CLI.** Vendor-copied schemas are the source of truth within this repo. Any divergence from the CLI must be deliberate and documented.
- **Token hygiene.** Tokens live only in `sessionStorage` in the browser and in memory in the auth function. No token is ever logged or persisted to any system under our control.
- **Conventional Commits.** Commits follow the same convention as the CLI repo for consistency, even though this repo uses trunk-based deploy instead of semantic-release.
- **Branch model.** `develop` for integration; `main` for deploys. PRs target `develop`; `develop` → `main` promotions trigger production deploys.
