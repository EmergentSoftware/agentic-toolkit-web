# Agentic Toolkit Web (ATK Web)

## 1. Project Overview

**Agentic Toolkit Web** is a lightweight, static React web application that provides a browser-based UI for discovering, downloading, and contributing assets to the Agentic Toolkit (ATK) registry. It is the non-technical counterpart to the `atk` CLI tool: same registry, same assets, same publishing pipeline — but delivered through a simple, point-and-click web interface instead of a terminal.

This project lives in its own repository under the **EmergentSoftware** GitHub organization (`EmergentSoftware/agentic-toolkit-web`) and is deployed as a static site to **GitHub Pages**.

### The ATK Ecosystem

There are three repositories that make up the Agentic Toolkit ecosystem:

| Repository | Role | Audience |
|---|---|---|
| `agentic-toolkit-registry` | The registry — where all skills, agents, rules, hooks, memory templates, and MCP configs live | Content store |
| `agentic-toolkit` | The `atk` CLI — developer tool for installing/managing assets in local projects | Developers |
| `agentic-toolkit-web` *(this project)* | The web UI — browse registry assets and contribute new ones through a browser | **Non-technical users** (Product Managers, Technical Product Managers, Product Owners, designers, etc.) |

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
- **Auth via GitHub** (needed to open PRs against the private registry repo; read access may also require auth depending on registry visibility).

### Out of scope

- Installation, uninstall, update, sync, audit, pin, freeze, dependency resolution — all CLI-only concerns.
- Lockfile management.
- Tool adapter placement logic (the web app doesn't place files into a project; it only downloads raw asset content).
- Bundle management (initially — may be added later; browse/download of bundles could be a fast follow).
- Editing existing assets in-place (MVP is create-new-only; edits can go through the CLI or PRs directly).
- Server-side logic — this is a static site; all interactions happen in the browser against GitHub's API.

## 4. Tech Stack

Intentionally small and conventional. No server, no backend — this is a fully static SPA deployed to GitHub Pages.

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
- **TanStack Query** — data fetching, caching, and loading states against the GitHub API.
- **Zod** — schema validation for form inputs and for parsing registry data. **Reuse the Zod schemas exported from the `agentic-toolkit` CLI** (`scripts/export-schemas.ts` produces JSON Schema; ideally we vendor or publish the Zod schemas so the web app validates manifests identically to the CLI).

### GitHub Integration
- **Octokit** (`@octokit/rest`) — read the registry, create branches, commit files, and open PRs.
- Auth via a **GitHub OAuth App** (standard web flow), with the `code`-for-token exchange handled by a tiny **Azure Function** (see §7 Authentication).

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
Shows the full manifest info plus a rendered Markdown README. Primary action is a **Download** button that packages the asset's files into a zip (or downloads the folder directly via the File System Access API where supported) and hands them to the user.

### Contribute flow (`atk publish` equivalent)
A guided form where a non-technical user can:
1. Choose asset type (skill, agent, rule, etc.).
2. Drag-drop a folder or pick files.
3. Fill in name, description, tags, README (with a live preview).
4. Select org scope (their org vs. global, where permitted).
5. Submit.

On submit, the app uses the signed-in user's GitHub credentials (via Octokit directly from the browser) to:
1. **Fork** `EmergentSoftware/agentic-toolkit-registry` into the user's personal GitHub account — or reuse their existing fork if one is already present.
2. **Create a new branch** on the fork (e.g. `contribute/<asset-type>-<asset-name>-<timestamp>`).
3. **Commit** the asset files and generated manifest to that branch.
4. **Open a pull request** from the user's fork branch back to the registry's default branch.

This is the same fork → branch → commit → PR pattern the `atk publish` CLI command uses. It works for **any EmergentSoftware org member** regardless of whether they have direct write access to the registry, since contributions always go through a personal fork.

The PR then runs through the **existing security review pipeline** in `agentic-toolkit-registry`. Assets are **never** merged directly — maintainer review is mandatory. The UI should make this clear to the user ("Your contribution will be reviewed before it appears in the registry") and show a success screen with a direct link to the opened PR.

### Org awareness
The app reads the user's GitHub org memberships and lets them scope browsing and publishing to their org. This mirrors the org field in the CLI's lockfile.

## 6. Architecture

- **Static SPA.** Built with Vite, deployed to GitHub Pages via GitHub Actions.
- **GitHub API as the backend.** Reads from `agentic-toolkit-registry` via the Contents API (same mechanism the CLI uses). Writes via the standard fork/branch/commit/PR flow — all done from the browser using Octokit.
- **One tiny Azure Function for auth only.** Its sole responsibility is exchanging the OAuth `code` for an access token (see §7). It is not an API proxy — all registry reads and writes go directly from the browser to GitHub.
- **Tokens live in the browser.** Access tokens are held in `sessionStorage` and never persisted to any server we operate. The Azure Function does not store tokens; it just brokers the handshake.
- **Registry schema parity with the CLI.** The web app validates and renders manifests using the same Zod schemas defined in `agentic-toolkit/src/lib/schemas/`. A valid asset in the CLI is a valid asset in the web UI, and vice versa.
- **No duplicate registry.** The web app reads the canonical `registry.json` published by the registry repo's CI — the same artifact the CLI consumes.

## 7. Authentication

### Approach: GitHub OAuth App + Azure Function token-exchange proxy

GitHub Pages is static-only, and GitHub's OAuth token-exchange endpoint does not support CORS from arbitrary browser origins. That rules out a pure-browser OAuth handshake. The minimum viable solution is a **tiny auth proxy** that holds the OAuth App's `client_secret` and handles the one `code`-for-token exchange. We are hosting this proxy as an **Azure Function** to match existing EmergentSoftware infra.

### Components

1. **GitHub OAuth App** registered under the EmergentSoftware org.
   - Callback URL: the deployed GitHub Pages URL.
   - Required scopes: `read:org` (to verify EmergentSoftware membership) and `repo` (to read the private registry, fork it, push to the user's fork, and open PRs).
2. **Azure Function** (Consumption plan, Node.js/TypeScript).
   - Single HTTP-triggered function: `POST /api/auth/exchange`.
   - Accepts an OAuth `code`, calls `github.com/login/oauth/access_token` with the stored `client_secret`, returns the resulting access token to the SPA.
   - `client_secret` lives in Function App application settings.
   - CORS restricted to the GitHub Pages origin.
   - Free tier is more than sufficient (1M requests/month). Cold starts of 1–3s are acceptable for a once-per-session event.
3. **SPA auth flow.**
   - User clicks "Sign in with GitHub" → redirected to the OAuth App authorize screen.
   - GitHub redirects back to the SPA with a `code`.
   - SPA `POST`s the code to the Azure Function → receives the access token.
   - SPA stores the token in `sessionStorage` and uses Octokit directly for all subsequent GitHub API calls (those endpoints support CORS for authenticated requests).

### Org membership gate

Immediately after auth, the SPA calls `GET /orgs/EmergentSoftware/members/{username}` to verify the user is a member of the EmergentSoftware GitHub organization.

- **Member:** proceeds into the app.
- **Non-member:** shown a friendly blocking screen explaining they must be a member of EmergentSoftware to use this tool, with contact guidance for being added.

### End-user prerequisites

To use ATK Web, a non-technical user needs:

1. A **GitHub account** (free signup at github.com).
2. **Membership in the `EmergentSoftware` GitHub organization** — granted by an org admin; one-time.
3. On first visit, **authorize the ATK Web OAuth App** via the standard GitHub consent screen — one click.

No PATs, no CLI, no terminal, no git knowledge required.

## 8. Deployment

- **Web app:** GitHub Pages hosted from `EmergentSoftware/agentic-toolkit-web`. GitHub Actions pipeline builds the Vite app on push to `main` and publishes to Pages.
- **Auth function:** deployed to Azure via GitHub Actions. Can live in the same repo under `/auth-function` or in a sibling repo — either works; same-repo is simpler for MVP.
- **Branching:** match the other ATK repos' `develop` → `main` convention for consistency.

## 9. Repository Layout (proposed)

```
agentic-toolkit-web/
├── src/
│   ├── components/        # shadcn/ui components + app components
│   ├── routes/            # page components (browse, detail, contribute)
│   ├── lib/
│   │   ├── github.ts      # Octokit client, auth, PR creation
│   │   ├── registry.ts    # fetch + parse registry.json
│   │   └── schemas/       # Zod schemas (vendored from agentic-toolkit)
│   ├── hooks/
│   └── main.tsx
├── auth-function/         # Azure Function for OAuth token exchange
│   ├── src/
│   │   └── exchange.ts    # POST /api/auth/exchange handler
│   ├── host.json
│   └── package.json
├── public/
├── .github/workflows/     # build + deploy web; deploy auth function
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
5. **Auth function location.** In-repo under `/auth-function` (simpler) or separate repo (cleaner separation of concerns)? Lean toward in-repo for MVP.

## 11. Success Criteria for MVP

The MVP is done when a non-technical user can:
1. Open the deployed web app in a browser.
2. Sign in with GitHub (one click) and pass the EmergentSoftware org-membership check.
3. Browse and filter all assets in the registry.
4. Download any asset as a zip.
5. Open a "Contribute" form, drop a folder of files, fill in metadata, and click Submit.
6. See a confirmation linking to the pull request that was opened on their behalf against `agentic-toolkit-registry`.

No CLI usage, no git commands, no terminal — the entire contribution flow happens in the browser.
