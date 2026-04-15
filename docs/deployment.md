# Production Deployment Runbook

This document describes how to deploy, configure, rotate secrets for, and roll back the two components of ATK Web:

- **SPA** — a Vite-built static site published to GitHub Pages by `.github/workflows/deploy-pages.yml`.
- **Auth function** — an Azure Functions v4 Node app (`auth-function/`) that brokers the GitHub OAuth code-for-token exchange, deployed by `.github/workflows/deploy-auth-function.yml`.

Both components deploy automatically on pushes to `main`. There is only one environment: **production**. There is no staging or deployment slot.

Related docs:

- `docs/OAUTH_APP_SETUP.md` — full step-by-step OAuth App registration playbook (dev and prod).
- `docs/PHASED_IMPLEMENTATION.md` — project-wide implementation phases.

---

## 1. Architecture at a glance

```
  GitHub Pages (SPA)                  Azure Functions (auth-function)
  https://emergentsoftware              https://<function-app>.azurewebsites.net
  .github.io/agentic-toolkit-web        /api/auth/exchange    (POST, CORS-gated)
                                        /api/health           (GET, unauthenticated)
```

- The SPA runs entirely in the browser using `HashRouter`; no server-side routing is required.
- The SPA calls `POST /api/auth/exchange` to swap a GitHub OAuth authorization code for an access token. The function holds the client secret and never exposes it to the browser.
- `GET /api/health` is used by the deploy workflow's smoke test; it returns `{ status: "ok", version }` and is unauthenticated.

---

## 2. One-time prerequisites

Before the pipelines can run end-to-end, the following must exist.

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

### 2.2 Azure Function App configuration

The Function App must exist before the deploy workflow can push to it. On the Function App's **Configuration → Application settings** blade, set:

| Key | Value | Notes |
|---|---|---|
| `GITHUB_OAUTH_CLIENT_ID` | Client ID from §2.1 | Safe to store as plain app setting. |
| `GITHUB_OAUTH_CLIENT_SECRET` | Client secret from §2.1 | Treat as a secret. Consider a Key Vault reference (`@Microsoft.KeyVault(...)`). |
| `CORS_ALLOWED_ORIGINS` | `https://emergentsoftware.github.io` | Must be the **origin** only (scheme + host), no path, no trailing slash. The SPA origin is the Pages host. |

Notes:

- Do **not** use the Azure Portal's built-in CORS blade — the function handles CORS itself in `cors.ts`, and the portal's CORS setting would conflict with those headers. Leave the portal CORS list empty.
- After editing app settings the Function App restarts automatically. Wait ~30s before re-running the health probe.

### 2.3 GitHub repo secrets & variables

On the `EmergentSoftware/agentic-toolkit-web` repo's **Settings → Secrets and variables → Actions** page:

**Repository secrets:**

| Name | Value |
|---|---|
| `AZURE_CREDENTIALS` | Full JSON output of a service principal with Contributor on the Function App's resource group. Create with: `az ad sp create-for-rbac --name "atk-web-deploy" --role contributor --scopes /subscriptions/<SUB_ID>/resourceGroups/<RG_NAME> --sdk-auth` — copy the entire JSON blob. |

**Repository variables:**

| Name | Value |
|---|---|
| `VITE_GITHUB_OAUTH_CLIENT_ID` | Client ID from §2.1 (baked into the SPA bundle at build time). |
| `VITE_AUTH_FUNCTION_URL` | `https://<function-app>.azurewebsites.net/api/auth/exchange` (full URL the SPA posts to). |
| `AZURE_FUNCTION_APP_NAME` | The Azure Function App resource name (the `<function-app>` portion above, without domain). |

The deploy workflow constructs the health URL as `https://${AZURE_FUNCTION_APP_NAME}.azurewebsites.net/api/health`, so the Function App name must resolve publicly under `azurewebsites.net`.

---

## 3. Normal deploy flow

### 3.1 SPA (`deploy-pages.yml`)

Triggered on push to `main` (and manually via `workflow_dispatch`). Pipeline:

1. **validate** — `pnpm install && pnpm lint && pnpm typecheck && pnpm test` for the web app, then the same sequence in `auth-function/`. A failure here blocks the Pages publish.
2. **build** — `pnpm build` with `VITE_GITHUB_OAUTH_CLIENT_ID` and `VITE_AUTH_FUNCTION_URL` injected from repo variables. Uploads `./dist` as a Pages artifact.
3. **deploy** — `actions/deploy-pages@v4` publishes the artifact to the `github-pages` environment.

The SPA's `base` in `vite.config.ts` is `/agentic-toolkit-web/`, so all built asset URLs are prefixed correctly for the Pages subpath.

### 3.2 Auth function (`deploy-auth-function.yml`)

Triggered on push to `main` that touches `auth-function/**` (and manually). Pipeline:

1. `pnpm install --frozen-lockfile` → `pnpm lint` → `pnpm typecheck` → `pnpm test` → `pnpm build` in `auth-function/`.
2. `pnpm prune --prod` — remove dev dependencies so the deploy package only ships what the runtime needs.
3. `azure/login@v2` with `AZURE_CREDENTIALS`.
4. `Azure/functions-action@v1` uploads `auth-function/` (minus `.funcignore` entries) to the Function App named by `AZURE_FUNCTION_APP_NAME`.
5. **Smoke test** — `curl https://<app>.azurewebsites.net/api/health` with up to 6 retries (10s apart). Any non-200 fails the job.

If the smoke test fails, the Function App has already received the new bits; follow the rollback procedure in §5.

---

## 4. Rotating the OAuth client secret (zero downtime)

GitHub supports **two concurrent client secrets per OAuth App**, which lets you cut over without a window where auth is broken.

1. **Generate a new secret.**
   GitHub → EmergentSoftware → OAuth Apps → `ATK Web (production)` → **Generate a new client secret**. Copy it. Both the old and new secrets are now valid simultaneously.
2. **Update the Function App to use the new secret.**
   Azure Portal → Function App → Configuration → Application settings → edit `GITHUB_OAUTH_CLIENT_SECRET` → paste the new value → **Save**. The Function App restarts (~30s). New logins now use the new secret; the old secret is still accepted by GitHub, so any login already mid-flight continues to work.
3. **Verify.**
   ```bash
   curl -sS https://<function-app>.azurewebsites.net/api/health   # expect {"status":"ok",...}
   ```
   Then perform a real sign-in against the SPA to confirm the code exchange succeeds.
4. **Delete the old secret.**
   Back on the OAuth App page, click the trash icon next to the old secret. From this point only the new secret is accepted.
5. **Update the password manager** with the new secret and remove the old one.

**Never** delete the old secret on GitHub before the Function App has been updated — that would immediately break production auth.

The SPA does not hold the client secret, so no SPA redeploy is ever required for a secret rotation. The **client ID** is public and stable; it does not rotate.

---

## 5. Rolling back a bad deploy

### 5.1 Rolling back the SPA

Each successful Pages deploy is a prior run of `deploy-pages.yml`. To roll back:

1. Go to **Actions → Deploy to GitHub Pages**.
2. Open the last known-good run (the one prior to the bad deploy).
3. Click **Re-run all jobs**.

Re-running rebuilds the SPA from the same commit SHA that was previously known-good and re-uploads the artifact, restoring the prior bundle. The `VITE_*` repo variables used at build time are whatever is currently set — if the breakage was caused by editing a repo variable, revert that variable first.

If the root cause is a bad commit already on `main`, revert it: `git revert <sha> && git push origin main`. That triggers a fresh `deploy-pages.yml` run with the revert applied.

### 5.2 Rolling back the auth function

Azure Functions does not keep historical slot snapshots in this configuration (no deployment slots are used). Two options, in order of preference:

1. **Git revert and redeploy (preferred).**
   Revert the offending commit on `main` and push:
   ```bash
   git revert <bad-sha>
   git push origin main
   ```
   `deploy-auth-function.yml` runs automatically. The health smoke test gates the outcome.

2. **Re-run the previous good workflow run.**
   Actions → Deploy Auth Function → open the last green run → **Re-run all jobs**. This rebuilds and redeploys from the older commit SHA. Note: repo-variable or secret changes since that run (e.g. a rotated secret) remain in effect — only the function code is reverted.

3. **Emergency manual redeploy.**
   Check out the last good commit locally and push a zip deploy:
   ```bash
   cd auth-function
   pnpm install --frozen-lockfile
   pnpm build
   pnpm prune --prod
   zip -r ../deploy.zip . -x '*.test.ts' '__tests__/*' 'local.settings.json'
   az functionapp deployment source config-zip \
     --resource-group <RG_NAME> \
     --name <FUNCTION_APP_NAME> \
     --src ../deploy.zip
   ```
   Then verify `/api/health` manually.

After any rollback, probe the health endpoint before declaring the incident over:

```bash
curl -sS https://<function-app>.azurewebsites.net/api/health
# { "status": "ok", "version": "x.y.z" }
```

---

## 6. Troubleshooting

| Symptom | Likely cause | Check |
|---|---|---|
| Sign-in fails with `origin_not_allowed` | `CORS_ALLOWED_ORIGINS` on the Function App doesn't match the Pages origin exactly. | App setting must be `https://emergentsoftware.github.io` — origin only, no path, no trailing slash. |
| Sign-in fails with `server_misconfigured` | OAuth env vars missing on the Function App. | Confirm `GITHUB_OAUTH_CLIENT_ID` and `GITHUB_OAUTH_CLIENT_SECRET` are set on **Configuration → Application settings** (not just local.settings.json). |
| SPA build-time vars empty in bundle | Repo variables renamed or missing. | Variables must be named `VITE_GITHUB_OAUTH_CLIENT_ID` and `VITE_AUTH_FUNCTION_URL` — these names are baked into `src/lib/session.ts`. |
| Deploy workflow succeeds but health smoke test fails | Function App still cold-starting, or runtime error at startup. | Check Log Stream in the Azure Portal. Re-run the job once; the smoke step retries 6× with 10s backoff, which normally absorbs cold-start. |
| `azure/login` step fails with `AADSTS7000215` | `AZURE_CREDENTIALS` secret is stale or malformed. | Recreate the service principal (`az ad sp create-for-rbac --sdk-auth`) and replace the secret value with the new JSON blob. |
