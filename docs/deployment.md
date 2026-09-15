# Production Deployment Runbook

This document describes how to deploy, configure, and roll back ATK Web.

- **SPA** — a Vite-built static site published to GitHub Pages by `.github/workflows/deploy-pages.yml`.
- **ATK API** — the shared .NET API (`func-atk-prod` / `func-atk-dev` Azure Function Apps) that the SPA talks to for the OAuth code exchange, registry reads, downloads, and publishing. The API is built and deployed from the `Emergent.AgenticToolkit` monorepo in Azure DevOps; **nothing in this repo deploys it**.

The SPA deploys automatically on pushes to `main`. There is only one SPA environment: **production**, which talks to the **prod** API. Local development (`pnpm dev`) talks to the **dev** API.

Related docs:

- `docs/OAUTH_APP_SETUP.md` — full step-by-step OAuth App registration playbook (dev and prod).
- `docs/PHASED_IMPLEMENTATION.md` — the original MVP build plan (historical, not maintained).
- `docs/Direction.md` and `docs/design/ClientContract.md` in the `Emergent.AgenticToolkit` monorepo — the API's contract and roadmap.

---

## 1. Architecture at a glance

```
  GitHub Pages (SPA)                  ATK API (Azure Functions, .NET)
  https://emergentsoftware              https://func-atk-prod.azurewebsites.net   (prod, used by Pages)
  .github.io/agentic-toolkit-web        https://func-atk-dev.azurewebsites.net    (dev, used by pnpm dev)
                                          POST /auth/github/exchange   (OAuth code → token; CORS-gated)
                                          GET  /me                     (identity + org-membership gate)
                                          GET  /registry, /assets/…, /bundles/…   (reads, downloads)
                                          POST /publish, /publish/plan            (open a registry PR)
```

- The SPA runs entirely in the browser using `HashRouter`; no server-side routing is required. `auth-redirect.html` is a second static page: the MSAL redirect bridge that Microsoft Entra returns to after sign-in (see §2.4).
- Two sign-in providers, one session. **Entra** (primary, "Sign in with your Emergent account"): MSAL runs the auth-code + PKCE flow against `login.microsoftonline.com` entirely in the browser; the API is not involved until the first call. **GitHub** (secondary, kept until the GitHub cutoff): the SPA calls `POST /auth/github/exchange` to swap an OAuth authorization code for an access token; the API holds the OAuth App's client secret (in Key Vault) and never exposes it to the browser.
- Every other call carries `Authorization: Bearer <token>`. The API picks the scheme by the token's shape and validates it: Entra access tokens against the Emergent Software tenant (members only, guests refused), GitHub tokens against EmergentSoftware org membership. Publishing with a GitHub token opens the pull request **with that same token** so the PR is authored by the user; publishing with an Entra token uses the API's publish identity, with the commit authored as the user and a "Published by … via Entra" line in the PR body.
- The API's OpenAPI contract is vendored at `openapi/openapi.json`; `src/lib/api/` is generated from it (`pnpm refresh-openapi && pnpm generate-api`).

---

## 2. One-time prerequisites

Before the pipeline can run end-to-end, the following must exist.

### 2.1 Production GitHub OAuth App

Register the OAuth App under the **EmergentSoftware** organization (not a personal account):

1. Go to **GitHub → EmergentSoftware org → Settings → Developer settings → OAuth Apps → New OAuth App**.
2. Fill in:
   - **Application name**: `ATK Web (production)`
   - **Homepage URL**: `https://emergentsoftware.github.io/agentic-toolkit-web/`
   - **Authorization callback URL**: `https://emergentsoftware.github.io/agentic-toolkit-web/` *(HashRouter appends `#/...` — GitHub ignores the hash fragment when matching the callback, so the repo root URL is the correct value.)*
3. Click **Register application**, then **Generate a new client secret**. Copy the secret immediately — GitHub shows it exactly once.
4. Record the **Client ID** and **Client secret** in the team password manager.

See `docs/OAUTH_APP_SETUP.md` §7–9 for the detailed walkthrough.

### 2.2 ATK API configuration

The client id and secret live with the API, not this repo. The **prod** API must be configured with the prod OAuth App's id (`github_oauth_client_id` in the monorepo's `infra/envs/prod/main.tf`) and secret (`github-oauth-client-secret` in the prod Key Vault); the **dev** API uses the dev OAuth App. CORS on both Function Apps must allow the SPA origins (`http://localhost:5173` and `https://emergentsoftware.github.io`; setting `cors_allowed_origins`). See `infra/README.md` in the monorepo.

### 2.3 GitHub repo variables

On the `EmergentSoftware/agentic-toolkit-web` repo's **Settings → Secrets and variables → Actions → Variables** page:

| Name | Value |
|---|---|
| `VITE_GITHUB_OAUTH_CLIENT_ID` | Client ID of the **prod** OAuth App from §2.1 (baked into the SPA bundle at build time; public). |
| `VITE_ATK_API_URL` | `https://func-atk-prod.azurewebsites.net` (base URL only: no `/api`, no trailing slash). |

The names must match exactly what `deploy-pages.yml` reads and `src/lib/api-client.ts` / `src/lib/session.ts` expect. No repository secrets are required for the SPA deploy.

### 2.4 Entra sign-in (nothing to configure per environment)

The Emergent-account sign-in uses the `ES ATK Web` app registration in the Emergent Software tenant (client id `07a23158-19c4-4180-a2a9-41cb80882a65`, tenant `25ee13ae-a8a5-4bc2-bb23-aea90536fb0c`, scope `api://8da5aa72-0565-4ae8-bf5a-db89d8bd3186/access_as_user`). One registration serves dev and prod, so the values are constants in `src/lib/entra.ts`; there are no `VITE_*` variables, secrets, or per-environment settings for it. The registration is owned in the monorepo (`infra/README.md`); the web app needs these on it:

| Setting | Value |
|---|---|
| Platform | Single-page application |
| Redirect URIs (the MSAL redirect bridge, `auth-redirect.html`) | `http://localhost:5173/agentic-toolkit-web/auth-redirect.html`, `https://emergentsoftware.github.io/agentic-toolkit-web/auth-redirect.html` |
| Redirect URIs (post-logout targets, the app root) | `http://localhost:5173/agentic-toolkit-web/`, `https://emergentsoftware.github.io/agentic-toolkit-web/` |
| ID token optional claim | `login_hint` (lets sign-out skip Microsoft's account picker) |
| API permissions | delegated `ATK API / access_as_user` (pre-authorized, no consent prompt) |

Both URIs include the Vite `base` (`/agentic-toolkit-web/`) because `pnpm dev` serves the app under it too. The bridge page is built as a second Vite entry (`build.rollupOptions.input` in `vite.config.ts`), so it is emitted into `dist/` and published to Pages with the app; it must be served from the app's own origin. A mismatch shows on Microsoft's page as `AADSTS50011` (`redirect_uri_mismatch`).

Entra tokens are held by MSAL in `sessionStorage` (per tab, like the GitHub token) and refreshed silently; when a silent refresh needs interaction the app signs out with a "Your Emergent sign-in has expired" notice. Sign-out ends the Microsoft web session too (`logoutRedirect`) and lands back on the app root.

### 2.5 GitHub sign-in cutoff

The API setting `Atk__Auth__GitHubSunset` (monorepo Terraform `github_auth_sunset`) schedules the end of GitHub sign-in. Before the date, the SPA shows a banner under the header to GitHub sessions ("GitHub sign-in to ATK ends on YYYY-MM-DD…", with a **Switch now** button that starts the Emergent sign-in); after it, GitHub sign-ins are refused with `401 github_auth_retired` and the landing shows the API's message. Entra sessions never see either. Nothing in this repo changes for the cutoff; it is set in the monorepo once the CLI and web both offer the Emergent sign-in.

---

## 3. Normal deploy flow (`deploy-pages.yml`)

Triggered on push to `main` (and manually via `workflow_dispatch`). Pipeline:

1. **validate** — `pnpm install && pnpm lint && pnpm typecheck && pnpm test`. A failure here blocks the Pages publish.
2. **build** — `pnpm build` with `VITE_GITHUB_OAUTH_CLIENT_ID` and `VITE_ATK_API_URL` injected from repo variables. Uploads `./dist` as a Pages artifact.
3. **deploy** — `actions/deploy-pages@v4` publishes the artifact to the `github-pages` environment.

The SPA's `base` in `vite.config.ts` is `/agentic-toolkit-web/`, so all built asset URLs are prefixed correctly for the Pages subpath.

**Merging to `main` is the production cutover**: there is no staging site. Verify changes locally against the dev API first (`docs/OAUTH_APP_SETUP.md` §6).

### 3.1 Picking up an API contract change

When the API's OpenAPI document changes:

```bash
pnpm refresh-openapi          # downloads openapi.json from the dev API (ATK_API_URL=… to override)
pnpm generate-api             # regenerates src/lib/api/ (committed; never edit by hand)
pnpm typecheck && pnpm test
```

Commit `openapi/openapi.json` and `src/lib/api/` together.

---

## 4. Rotating the OAuth client secret (zero downtime)

The client secret is held by the ATK API, so rotation is an API/Key Vault change, not an SPA change.

1. **Generate a new secret.** GitHub → EmergentSoftware → OAuth Apps → `ATK Web (production)` → **Generate a new client secret**. Both the old and new secrets are valid simultaneously.
2. **Update the prod Key Vault secret** `github-oauth-client-secret` (see the monorepo's `infra/README.md`) and restart the prod Function App if the setting is not picked up automatically.
3. **Verify** by signing in to the SPA on the production URL; the exchange must return `200` with an `access_token`.
4. **Delete the old secret** on the OAuth App page.
5. **Update the password manager** with the new secret and remove the old one.

**Never** delete the old secret on GitHub before the API has the new one — that would immediately break production sign-in.

The SPA does not hold the client secret, so no SPA redeploy is ever required for a secret rotation. The **client ID** is public and stable; it does not rotate.

---

## 5. Rolling back a bad deploy

Each successful Pages deploy is a prior run of `deploy-pages.yml`. To roll back:

1. Go to **Actions → Deploy to GitHub Pages**.
2. Open the last known-good run (the one prior to the bad deploy).
3. Click **Re-run all jobs**.

Re-running rebuilds the SPA from the same commit SHA that was previously known-good and re-uploads the artifact, restoring the prior bundle. The `VITE_*` repo variables used at build time are whatever is currently set — if the breakage was caused by editing a repo variable, revert that variable first.

If the root cause is a bad commit already on `main`, revert it: `git revert <sha> && git push origin main`. That triggers a fresh `deploy-pages.yml` run with the revert applied.

An API-side incident (the exchange, `/me`, or registry reads failing) is handled in the monorepo's pipelines, not here.

---

## 6. Troubleshooting

| Symptom | Likely cause | Check |
|---|---|---|
| Emergent sign-in stops on a Microsoft page saying `AADSTS50011` / redirect URI mismatch | The `ES ATK Web` registration lacks the bridge URI for this origin. | Both `auth-redirect.html` URIs in §2.4 must be registered exactly, including `/agentic-toolkit-web/`. |
| Landing shows "Sign-in did not complete (…)" after returning from Microsoft | The user cancelled, or Entra returned an error (`access_denied`, network). | The notice carries Entra's own description; sign in again. |
| Landing shows "Your Emergent sign-in has expired" | A silent token refresh needed interaction (session revoked, 24h SPA refresh-token limit). | Sign in again. |
| App shows "Not authorized" for an Emergent account | `GET /me` returned `403 guest_not_allowed`: the account is a guest in the tenant. | ATK is for tenant members; use an Emergent account or sign in with GitHub. |
| Sign-in fails with a CORS error in the browser console | The API's `cors_allowed_origins` does not include the SPA origin. | Must contain `https://emergentsoftware.github.io` (prod) / `http://localhost:5173` (dev) — origin only, no path, no trailing slash. |
| Sign-in fails with `Auth exchange failed (HTTP 400): bad_verification_code` | The `code` was already used or expired, or the SPA's client id does not match the API's. | Local dev must use the **dev** OAuth App id (the dev API's id); Pages must use the **prod** id. Start the sign-in over. |
| Sign-in fails with `Auth exchange failed (HTTP 500)` | The API is missing its OAuth configuration. | Check `github_oauth_client_id` and the Key Vault secret for that environment. |
| App shows "Not authorized" for a known org member | `GET /me` returned `403 org_membership_unverifiable`. | SAML SSO not authorized for the token, or the OAuth App is not approved for the org (`https://github.com/orgs/EmergentSoftware/policies/applications`). The browser console logs the hint. |
| App drops back to the signed-out landing on load | `GET /me` returned `401`; the stored token is dead. | Sign in again. If the landing shows "GitHub sign-in to ATK ended on …", the cutoff has passed: use the Emergent account. |
| `VITE_ATK_API_URL is not set` at startup | Repo variable or `.env.local` missing. | Variables must be named `VITE_GITHUB_OAUTH_CLIENT_ID` and `VITE_ATK_API_URL`. |
| Downloads fail with "The ATK API is unavailable" | API 5xx (usually GitHub upstream). | Retry; check the API's App Insights in Azure. |
