# Agentic Toolkit Web (ATK Web)

## 1. Project Overview

**Agentic Toolkit Web** is a lightweight, static React web application that provides a browser-based UI for discovering, downloading, and contributing assets to the Agentic Toolkit (ATK) registry. It is the non-technical counterpart to the `atk` CLI tool: same registry, same assets, same publishing pipeline — but delivered through a simple, point-and-click web interface instead of a terminal.

This project lives in its own repository under the **EmergentSoftware** GitHub organization (`EmergentSoftware/agentic-toolkit-web`) and is deployed as a static site to **GitHub Pages**.

### The ATK Ecosystem

There are three repositories that make up the Agentic Toolkit ecosystem:

| Repository | Role | Audience |
|---|---|---|
| `agentic-toolkit-registry` | The registry — where all skills, agents, rules, hooks, memory templates, and MCP configs live | Content store |
| `agentic-toolkit-cli` | The `atk` CLI — developer tool for installing/managing assets in local projects | Developers |
| `agentic-toolkit-web` *(this project)* | The web UI — browse registry assets and contribute new ones through a browser | **Non-technical users** (Product Managers, Technical Product Managers, Product Owners, designers, etc.) |
| `Emergent.AgenticToolkit` (Azure DevOps) | The **ATK API** — the .NET API both the CLI and the web app talk to for registry reads, downloads, publishing, and the web sign-in exchange | Platform |

## 2. Purpose & Audience

The CLI is powerful but assumes a developer workflow: terminal, git, `gh auth`, `.atk-lock.json`, dependency resolution, freeze/pin/sync semantics, etc. That surface area is unnecessary — and intimidating — for non-technical teammates who still benefit from using and contributing skills and agents.

**ATK Web exists to serve those users.** The experience should feel like a simple asset catalog with a "Download" button and a "Contribute" button. No lockfile. No install plan. No command line.

### Who it's for

- **Product Managers / Product Owners** who want to grab a prompting skill or review rule and drop it into their own tool setup.
- **Technical Product Managers** contributing domain-specific skills (PRD templates, discovery checklists, review rubrics) back to the team's shared registry.
- **Designers, analysts, ops** — anyone who uses Claude / Cursor / Copilot but doesn't live in a terminal.

### Who it's *not* for

Developers should continue to use the `atk` CLI. ATK Web deliberately does **not** cover installation, dependency management, lockfiles, sync, pin/freeze, audit, or any other developer-workflow concerns.

## 3. Scope

### In scope (MVP)

- **Browse** all assets in the registry — skills, agents, rules, hooks, memory templates, MCP configs.
- **Filter & search** by asset type, tag, tool compatibility, trust level, and org scope (org-specific vs. global).
- **View asset details** — name, description, README, author, version, trust level, tags, compatibility.
- **Download** an asset as a folder/zip to the user's local filesystem.
- **Contribute a new asset** through a guided form:
  - Drag-and-drop / file-picker upload of the asset's folder.
  - Fields for name, description, README, type, tags.
  - On submit, opens a **pull request** against `agentic-toolkit-registry` (mirroring the CLI's `atk publish` flow) so the existing security review pipeline runs.
- **Org support** — users can view assets scoped to their org or global assets.
- **Auth via GitHub** (the ATK API validates the token, gates on EmergentSoftware org membership, and opens PRs with it so they are authored by the user).

### Out of scope

- Installation, uninstall, update, sync, audit, pin, freeze, dependency resolution — all CLI-only concerns.
- Lockfile management.
- Tool adapter placement logic (the web app doesn't place files into a project; it only downloads raw asset content).
- Bundle management (initially — may be added later; browse/download of bundles could be a fast follow).
- Editing existing assets in-place (MVP is create-new-only; edits can go through the CLI or PRs directly).
- Server-side logic in this repo — this is a static site; every registry interaction goes through the shared ATK API, which lives in the `Emergent.AgenticToolkit` monorepo.

## 4. Tech Stack

Intentionally small and conventional. No server in this repo — this is a fully static SPA deployed to GitHub Pages that talks to the shared ATK API.

### Core
- **Vite** — build tool and dev server.
- **React 19** + **TypeScript** (strict mode).
- **React Router** — client-side routing (HashRouter recommended for GitHub Pages compatibility).

### UI
- **shadcn/ui** with the **Base UI** integration — component library and design primitives.
- **Tailwind CSS** — utility styling (implied by shadcn).
- **lucide-react** — icons (shadcn default).

### Data & Forms
- **TanStack Table** — asset browse/list view with sorting, filtering, column visibility.
- **TanStack Form** — the "Contribute asset" form.
- **TanStack Query** — data fetching, caching, and loading states against the ATK API.
- **Zod** — schema validation for form inputs and for parsing registry data. **Reuse the Zod schemas exported from the `agentic-toolkit` CLI** (`scripts/export-schemas.ts` produces JSON Schema; ideally we vendor or publish the Zod schemas so the web app validates manifests identically to the CLI).

### ATK API Integration
- **`@hey-api/openapi-ts`** — generates a typed fetch client (`src/lib/api/`) from the API's vendored OpenAPI contract (`openapi/openapi.json`). `src/lib/api-client.ts` wraps it with the base URL (`VITE_ATK_API_URL`), bearer auth from the session token, retries, and error mapping.
- Auth via a **GitHub OAuth App** (standard web flow), with the `code`-for-token exchange handled by the ATK API's `POST /auth/github/exchange` (see §7 Authentication).

### Tooling
- **ESLint** + **Prettier** — match the conventions used in `agentic-toolkit`.
- **Vitest** + **@testing-library/react** — unit and component tests (matches the CLI repo's testing stack).

## 5. Key Features

### Browse view (`atk browse` equivalent)
A filterable, searchable table/grid of all assets in the registry. Columns include name, type, description, version, tags, trust level, org scope, and a download action. Users can:
- Filter by type (skill / agent / rule / hook / memory / MCP).
- Filter by tag, tool compatibility, and trust level.
- Toggle between global assets and their org's assets.
- Click into an asset to see full details and the rendered README.

### Asset detail view
Shows the full manifest info, the file listing from the API, and a rendered Markdown README. Primary action is a **Download** button that fetches a zip (or `.skill` archive) built by the ATK API — the asset plus its transitive dependencies — and hands it to the user.

### Contribute flow (`atk publish` equivalent)
A guided form where a non-technical user can:
1. Choose asset type (skill, agent, rule, etc.).
2. Drag-drop a folder or pick files.
3. Fill in name, description, tags, README (with a live preview).
4. Select org scope (their org vs. global, where permitted).
5. Submit.

On submit, the app sends the manifest and files to the ATK API's `POST /publish` (with `client: "web"`). The API validates the payload against the registry's JSON Schemas and rules, then — **using the signed-in user's own GitHub token** — creates a branch on `EmergentSoftware/agentic-toolkit-registry`, commits the files under `assets/{type}s/[@{org}/]{name}/{version}/`, and opens a pull request authored by the user. `?dryRun=1` sends the same payload to `POST /publish/plan`, which validates and returns the plan without touching GitHub.

This is the same path the `atk publish` CLI command uses, so the branch, path, PR title, and body conventions are identical.

The PR then runs through the **existing security review pipeline** in `agentic-toolkit-registry`. Assets are **never** merged directly — maintainer review is mandatory. The UI should make this clear to the user ("Your contribution will be reviewed before it appears in the registry") and show a success screen with a direct link to the opened PR.

### Org awareness
Assets and bundles may be org-scoped (`org` in the manifest; `@{org}/` in registry paths and `?org=` on API calls). The app lets users browse by org scope, publish org-scoped assets, and create org-scoped bundles. This mirrors the org field in the CLI's lockfile.

## 6. Architecture

- **Static SPA.** Built with Vite, deployed to GitHub Pages via GitHub Actions.
- **The ATK API as the backend.** Every registry read (`GET /registry`, manifests, READMEs, file listings), every download (server-built zips), and every publish goes through the shared API; the browser never talks to GitHub's REST API directly. The CLI uses the same endpoints, so both clients see identical behaviour.
- **Token passthrough.** The API validates the user's GitHub token and EmergentSoftware membership on each request and opens publish PRs with that same token, so PR authorship and the review workflow are unchanged from the CLI. The API never persists user tokens.
- **Tokens live in the browser.** Access tokens are held in `sessionStorage` and never persisted to any server we operate.
- **Registry schema parity with the CLI.** The web app validates and renders manifests using the same Zod schemas defined in `agentic-toolkit/src/lib/schemas/`. A valid asset in the CLI is a valid asset in the web UI, and vice versa.
- **No duplicate registry.** The web app reads the canonical `registry.json` published by the registry repo's CI — the same artifact the CLI consumes.

## 7. Authentication

### Approach: GitHub OAuth App + ATK API token exchange

GitHub Pages is static-only, and GitHub's OAuth token-exchange endpoint does not support CORS from arbitrary browser origins. That rules out a pure-browser OAuth handshake. The ATK API holds the OAuth App's `client_secret` and performs the one `code`-for-token exchange at `POST /auth/github/exchange` (this replaced the repo's earlier standalone `auth-function`).

### Components

1. **GitHub OAuth App** registered under the EmergentSoftware org.
   - Callback URL: the deployed GitHub Pages URL.
   - Required scopes: `read:org` (to verify EmergentSoftware membership) and `repo` (to read the private registry, fork it, push to the user's fork, and open PRs).
2. **ATK API** (`func-atk-prod` / `func-atk-dev`, .NET on Azure Functions; deployed from the monorepo).
   - `POST /auth/github/exchange` accepts an OAuth `code`, calls `github.com/login/oauth/access_token` with the stored `client_secret`, and returns GitHub's token response verbatim.
   - The client secret lives in Key Vault; CORS is restricted to the SPA origins.
   - Two OAuth Apps: the **dev** app's id is configured on the dev API (used by `pnpm dev`), the **prod** app's id on the prod API (used by GitHub Pages).
3. **SPA auth flow.**
   - User clicks "Sign in with GitHub" → redirected to the OAuth App authorize screen.
   - GitHub redirects back to the SPA with a `code`.
   - SPA `POST`s the code to `{VITE_ATK_API_URL}/auth/github/exchange` → receives the access token.
   - SPA stores the token in `sessionStorage` and sends it as `Authorization: Bearer …` on every ATK API call.

### Org membership gate

Immediately after auth, the SPA calls the API's `GET /me`. The API validates the token and checks EmergentSoftware membership itself:

- **`200`:** active member — proceeds into the app; the response supplies the login, name, and avatar for display.
- **`403 not_org_member` / `org_membership_unverifiable`:** shown a friendly blocking screen explaining they must be a member of EmergentSoftware to use this tool, with contact guidance for being added (the unverifiable case logs SAML / OAuth-App-approval hints to the console).
- **`401`:** the stored token is dead; the app returns to the signed-out landing.

### End-user prerequisites

To use ATK Web, a non-technical user needs:

1. A **GitHub account** (free signup at github.com).
2. **Membership in the `EmergentSoftware` GitHub organization** — granted by an org admin; one-time.
3. On first visit, **authorize the ATK Web OAuth App** via the standard GitHub consent screen — one click.

No PATs, no CLI, no terminal, no git knowledge required.

## 8. Deployment

- **Web app:** GitHub Pages hosted from `EmergentSoftware/agentic-toolkit-web`. GitHub Actions pipeline builds the Vite app on push to `main` (with `VITE_GITHUB_OAUTH_CLIENT_ID` and `VITE_ATK_API_URL` from repo variables) and publishes to Pages. Merging to `main` is the production deploy.
- **ATK API:** deployed from the `Emergent.AgenticToolkit` monorepo via Azure Pipelines; nothing in this repo deploys it.
- **Branching:** feature branches off `main`, PRs to `main`.

## 9. Repository Layout (proposed)

```
agentic-toolkit-web/
├── openapi/openapi.json        # vendored ATK API contract (pnpm refresh-openapi)
├── openapi-ts.config.ts        # @hey-api/openapi-ts config (pnpm generate-api)
├── src/
│   ├── components/             # shadcn/ui components + app components
│   ├── routes/                 # page components (browse, detail, contribute, bundles)
│   ├── lib/
│   │   ├── api/                # GENERATED typed client + types (do not edit)
│   │   ├── api-client.ts       # base URL, bearer auth, retries, error mapping
│   │   ├── session.ts          # OAuth redirect + code exchange helpers
│   │   ├── registry-client.ts  # registry index, manifests, READMEs, file listings
│   │   ├── download-service.ts # server-built zip / .skill downloads
│   │   ├── publish-service.ts  # POST /publish and /publish/plan payloads
│   │   └── schemas/            # Zod schemas (vendored from agentic-toolkit-cli)
│   ├── hooks/                  # TanStack Query hooks (useRegistry, useAssetFiles, …)
│   ├── providers/              # SessionProvider (token, GET /me, status machine)
│   └── main.tsx
├── public/
├── .github/workflows/          # validate PRs; build + deploy Pages on main
├── vite.config.ts
├── tsconfig.json
├── eslint.config.js
└── package.json
```

## 10. Open Questions / Decisions for the Build Agent

These are intentionally unresolved — they need a call before or during implementation:

1. **Schema sharing.** Do we publish the Zod schemas from `agentic-toolkit` as a standalone package (e.g. `@detergent-software/atk-schemas`), or vendor-copy them into the web repo? Publishing is cleaner long-term; vendoring is faster for MVP.
2. **Download format.** Zip (via `jszip`) is universal. The File System Access API offers nicer UX on Chromium but needs a fallback. MVP recommendation: zip download.
3. **Versioning / release process.** Does this repo need `semantic-release` like the CLI, or is trunk-based "deploy on merge to main" enough for a static site?
4. **Bundles in MVP?** The registry has bundles (curated groups of assets). Recommend: read-only bundle browsing in MVP, no bundle authoring.
5. ~~**Auth function location.**~~ Resolved: the code exchange moved into the shared ATK API (2026-09); the in-repo `auth-function` was retired.

## 11. Success Criteria for MVP

The MVP is done when a non-technical user can:
1. Open the deployed web app in a browser.
2. Sign in with GitHub (one click) and pass the EmergentSoftware org-membership check.
3. Browse and filter all assets in the registry.
4. Download any asset as a zip.
5. Open a "Contribute" form, drop a folder of files, fill in metadata, and click Submit.
6. See a confirmation linking to the pull request that was opened on their behalf against `agentic-toolkit-registry`.

No CLI usage, no git commands, no terminal — the entire contribution flow happens in the browser.
