# GitHub OAuth App Setup — Run Sheet

This run sheet walks through registering the **dev** and **production** GitHub OAuth Apps that back ATK Web's sign-in flow, and wiring their credentials into the auth function and the SPA.

Two OAuth Apps are required — one for local development, one for production — so that local experimentation never hits the production callback URL and so that rotating one secret never disrupts the other environment.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Concepts](#2-concepts)
3. [Register the DEV OAuth App](#3-register-the-dev-oauth-app)
4. [Wire DEV credentials into the auth function](#4-wire-dev-credentials-into-the-auth-function)
5. [Wire DEV credentials into the SPA](#5-wire-dev-credentials-into-the-spa)
6. [Verify the DEV end-to-end handshake](#6-verify-the-dev-end-to-end-handshake)
7. [Register the PROD OAuth App](#7-register-the-prod-oauth-app)
8. [Wire PROD credentials into the Azure Function App](#8-wire-prod-credentials-into-the-azure-function-app)
9. [Wire PROD credentials into the SPA build](#9-wire-prod-credentials-into-the-spa-build)
10. [Rotating a client secret](#10-rotating-a-client-secret)
11. [Revoking / deleting an OAuth App](#11-revoking--deleting-an-oauth-app)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Prerequisites

Before starting, confirm you have:

- [ ] **Owner** permission on the `EmergentSoftware` GitHub organization (required to register an org-owned OAuth App and to add production secrets to the `agentic-toolkit-web` repo).
- [ ] **Contributor** access to the `EmergentSoftware/agentic-toolkit-web` repository.
- [ ] **Contributor** (or `Application Administrator`) access to the Azure subscription that hosts the production Function App, with permission to edit Function App **Configuration → Application settings**.
- [ ] A password manager or other secure secret store (for stashing each OAuth App's `client_secret`, which is shown **exactly once** at creation).
- [ ] Locally: Node.js `>= 20.x` and `pnpm` `10.5.2`, plus [Azure Functions Core Tools v4](https://learn.microsoft.com/azure/azure-functions/functions-run-local) (`func --version` should report `4.x`).

> **Tip:** Register both OAuth Apps under the **EmergentSoftware org**, not under a personal account. Personal-account OAuth Apps disappear with the account and can't be transferred cleanly.

---

## 2. Concepts

| Term | Meaning |
|---|---|
| **OAuth App** | A GitHub registration that issues `client_id` / `client_secret` pairs and a callback URL. Users authorize the app; GitHub then redirects to the callback URL with a short-lived `code`. |
| **`client_id`** | Public identifier for the OAuth App. Embedded in the SPA at build time via `VITE_GITHUB_OAUTH_CLIENT_ID`. Not a secret. |
| **`client_secret`** | Secret identifier that proves the exchange request is legitimate. **Must never ship to the browser.** Held only by the auth function. |
| **Authorization callback URL** | Where GitHub redirects after the user consents. Must exactly match the SPA's runtime origin + `/#/auth/callback` (the hash route is because ATK Web uses `HashRouter`). |
| **`code`** | A one-time, short-lived token the SPA receives in the callback URL. The SPA `POST`s it to the auth function, which exchanges it for an `access_token` by calling GitHub with the `client_secret`. |
| **`access_token`** | A GitHub user access token scoped to `read:org` and `repo`. Stored in `sessionStorage` in the browser. Never persisted server-side. |

---

## 3. Register the DEV OAuth App

1. Navigate to **`https://github.com/organizations/EmergentSoftware/settings/applications`**.
2. Click **OAuth Apps** in the left nav, then **New OAuth App**.
3. Fill the form:

   | Field | Value |
   |---|---|
   | Application name | `ATK Web (dev)` |
   | Homepage URL | `http://localhost:5173` |
   | Application description | `Development instance of ATK Web. Not for end users.` |
   | Authorization callback URL | `http://localhost:5173/#/auth/callback` |
   | Enable Device Flow | **Unchecked** |

4. Click **Register application**.
5. On the resulting page, note the **Client ID** — it is safe to paste into chat, commit to a template file, etc.
6. Click **Generate a new client secret**. Copy the value **immediately** into your password manager under a secret labeled `ATK Web Dev — client_secret`. GitHub will never show it again.
7. Under **Permissions** (if shown) or at OAuth consent time, confirm the app requests `read:org` and `repo` scopes. OAuth Apps do not have per-app scope settings — scopes are passed at authorize time by the SPA — so no action here beyond noting the expected scopes for later verification.

> **Do not** upload a logo, set a privacy policy URL, or mark the app as public — this is a development-only instance.

---

## 4. Wire DEV credentials into the auth function

The auth function reads credentials from `auth-function/local.settings.json`, which is **git-ignored**. A committed template (`auth-function/local.settings.json.template`) documents the required keys.

1. From the repo root:

   ```bash
   cp auth-function/local.settings.json.template auth-function/local.settings.json
   ```

2. Open `auth-function/local.settings.json` and fill in the values you recorded in step 3:

   ```jsonc
   {
     "IsEncrypted": false,
     "Values": {
       "AzureWebJobsStorage": "",
       "FUNCTIONS_WORKER_RUNTIME": "node",
       "GITHUB_OAUTH_CLIENT_ID": "<paste DEV client_id here>",
       "GITHUB_OAUTH_CLIENT_SECRET": "<paste DEV client_secret here>",
       "CORS_ALLOWED_ORIGINS": "http://localhost:5173"
     }
   }
   ```

3. Verify `auth-function/local.settings.json` is listed in `auth-function/.gitignore` (or the root `.gitignore`) and that `git status` does **not** show it as a tracked or staged file. If it does, stop and fix the ignore rule before continuing.

---

## 5. Wire DEV credentials into the SPA

The SPA needs the DEV `client_id` (public) and the auth-function URL (public) at dev server startup.

1. From the repo root:

   ```bash
   cp .env.example .env.local
   ```

2. Open `.env.local` and fill in:

   ```bash
   VITE_GITHUB_OAUTH_CLIENT_ID=<paste DEV client_id here>
   VITE_AUTH_FUNCTION_URL=http://localhost:7071
   ```

   `7071` is the default port Azure Functions Core Tools uses for local HTTP triggers.

3. Confirm `.env.local` is git-ignored (Vite projects ignore `.env.local` by default; verify with `git status`).

> `VITE_AUTH_FUNCTION_URL` is the base URL. The SPA appends `/api/auth/exchange` itself. Do **not** include a trailing slash.

---

## 6. Verify the DEV end-to-end handshake

1. **Terminal A** — start the auth function:

   ```bash
   cd auth-function
   pnpm install
   pnpm start        # invokes `func start` under the hood
   ```

   Expect output containing:

   ```
   Functions:
     exchange: [POST] http://localhost:7071/api/auth/exchange
   ```

2. **Terminal B** — start the SPA:

   ```bash
   pnpm install
   pnpm dev
   ```

   Expect Vite to print `Local: http://localhost:5173/`.

3. In the browser, open `http://localhost:5173`, click **Sign in with GitHub**, and complete consent.
4. On the callback, open the browser devtools **Network** tab and confirm:
   - A `POST http://localhost:7071/api/auth/exchange` request fires.
   - The response is `200 OK` with a JSON body containing `access_token`.
   - The response **does not** include a `Set-Cookie` header or any reflection of `client_secret`.
5. Confirm the SPA advances past the sign-in screen. If it lands on the org-membership blocking screen, that is expected for any account that isn't a member of `EmergentSoftware`.

> **Stop here if any step fails.** Jump to [Troubleshooting](#12-troubleshooting) before moving to production.

---

## 7. Register the PROD OAuth App

Only do this once the dev app is fully working and the production Pages URL is known.

1. Navigate to **`https://github.com/organizations/EmergentSoftware/settings/applications`** → **New OAuth App**.
2. Fill the form:

   | Field | Value |
   |---|---|
   | Application name | `ATK Web` |
   | Homepage URL | `https://emergentsoftware.github.io/agentic-toolkit-web/` |
   | Application description | `Browser UI for the Agentic Toolkit registry.` |
   | Authorization callback URL | `https://emergentsoftware.github.io/agentic-toolkit-web/#/auth/callback` |
   | Enable Device Flow | **Unchecked** |

3. Click **Register application**, note the **Client ID**, generate a **new client secret**, and copy it to the password manager as `ATK Web Prod — client_secret`.
4. Optionally upload a logo at this point — this is the branded app end users will see on the consent screen.

> If the production Pages URL changes (custom domain, org rename, etc.), update the Homepage URL and the Authorization callback URL on this OAuth App immediately. GitHub rejects handshakes whose callback doesn't exactly match one of the registered URLs.

---

## 8. Wire PROD credentials into the Azure Function App

Never commit the production `client_secret`. It lives only in Azure.

1. Sign in to **`https://portal.azure.com`**.
2. Navigate to the production Function App (name TBD — filled in during Phase 11 deployment setup).
3. Left nav → **Settings → Environment variables** (formerly **Configuration → Application settings**).
4. Add or update these **Application settings**:

   | Name | Value |
   |---|---|
   | `GITHUB_OAUTH_CLIENT_ID` | `<PROD client_id from step 7>` |
   | `GITHUB_OAUTH_CLIENT_SECRET` | `<PROD client_secret from step 7>` |
   | `CORS_ALLOWED_ORIGINS` | `https://emergentsoftware.github.io` |
   | `FUNCTIONS_WORKER_RUNTIME` | `node` |
   | `WEBSITE_NODE_DEFAULT_VERSION` | `~20` |

5. Click **Apply** / **Save**, then **Continue** when Azure warns the app will restart.
6. Verify:

   ```bash
   curl -i -X OPTIONS https://<function-app-host>/api/auth/exchange \
     -H "Origin: https://emergentsoftware.github.io" \
     -H "Access-Control-Request-Method: POST"
   ```

   The response should include `Access-Control-Allow-Origin: https://emergentsoftware.github.io`. **It must not** echo `*` and must not echo any other origin.
7. Confirm that no Application Insights log entry from the function contains the literal value of `GITHUB_OAUTH_CLIENT_SECRET`, any `code` value, or any `access_token` value. If any of these leak, stop and file a rotation ticket before continuing (see [§10](#10-rotating-a-client-secret)).

---

## 9. Wire PROD credentials into the SPA build

The production GitHub Actions deploy workflow (Phase 11) injects these at build time.

1. Navigate to **`https://github.com/EmergentSoftware/agentic-toolkit-web/settings/secrets/actions`**.
2. Add the following **repository secrets** (Secrets, not Variables — they're consumed by the build and then compiled into the bundle; do not mistake their visibility in logs for safety):

   | Secret name | Value |
   |---|---|
   | `PROD_VITE_GITHUB_OAUTH_CLIENT_ID` | `<PROD client_id>` |
   | `PROD_VITE_AUTH_FUNCTION_URL` | `https://<function-app-host>` |

3. The deploy workflow maps these to `VITE_GITHUB_OAUTH_CLIENT_ID` and `VITE_AUTH_FUNCTION_URL` before invoking `pnpm build`. No other SPA-side action is needed.

> `VITE_GITHUB_OAUTH_CLIENT_ID` is public — it ends up in the compiled JavaScript bundle. GitHub's OAuth model assumes the `client_id` is visible to the browser; security comes from the `client_secret` staying server-side.

---

## 10. Rotating a client secret

Rotate on a schedule (every 90 days is a reasonable cadence) and immediately if a secret is suspected of being exposed (leaked to logs, committed to a repo, shared over an unencrypted channel, etc.).

**Rotate the DEV secret:**

1. GitHub → OAuth App **ATK Web (dev)** → **Generate a new client secret**.
2. Copy the new value into your password manager.
3. Update `auth-function/local.settings.json` locally.
4. Restart `func start`.
5. Return to the old secret on the GitHub page and click **Revoke** on the old secret row.

**Rotate the PROD secret:**

1. GitHub → OAuth App **ATK Web** → **Generate a new client secret**. (GitHub allows two secrets to coexist during rotation.)
2. Copy the new value into the password manager.
3. Azure Portal → Function App → Environment variables → update `GITHUB_OAUTH_CLIENT_SECRET` to the new value → **Apply** → wait for restart.
4. Verify sign-in still works end-to-end on the production URL.
5. Return to the GitHub OAuth App page and click **Revoke** on the old secret row.

**Do not** revoke the old secret before the new one is live in Azure — doing so causes a brief outage where every sign-in fails.

---

## 11. Revoking / deleting an OAuth App

If an OAuth App must be retired (e.g., the callback URL permanently changed and a new app was registered to replace it):

1. Communicate the change ahead of time — all active user sessions will eventually need to re-authorize against the new app.
2. GitHub → OAuth App → **Delete application** at the bottom of the settings page. Confirm by typing the app name.
3. Clean up any `client_id` / `client_secret` references in Azure Function settings, local `local.settings.json`, and GitHub Actions secrets.
4. Remove any password-manager entries that reference the retired app.

---

## 12. Troubleshooting

### "The redirect_uri MUST match the registered callback URL for this application."

The callback URL registered on the OAuth App does not exactly match what the SPA passes at authorize time. Checklist:

- The URL uses the **hash** fragment (`/#/auth/callback`), not a path fragment (`/auth/callback`).
- Protocol matches (`http://` for local, `https://` for prod).
- Host matches (`localhost:5173` with the explicit port; no trailing slash).
- GitHub trims trailing whitespace poorly — re-enter the value if copy-paste introduced a stray space.

### `401` from the auth function on `POST /api/auth/exchange`

Usually a bad or expired `code`. Codes expire after ~10 minutes and are single-use. Start the flow over from the sign-in button. If the error persists:

- Confirm `GITHUB_OAUTH_CLIENT_ID` and `GITHUB_OAUTH_CLIENT_SECRET` in the function's environment come from the **same** OAuth App (dev matches dev, prod matches prod — not mixed).
- Confirm the SPA is sending the `code` it just received, not a cached value.

### `CORS` preflight fails in the browser

- Confirm `CORS_ALLOWED_ORIGINS` exactly matches the browser's `Origin` header, including scheme and port — no wildcards, no trailing slash.
- Confirm the function is running Node v4 programming model with the `Access-Control-*` headers set on the `OPTIONS` branch.
- If behind a corporate proxy that rewrites `Origin`, test from a different network to rule out network-layer interference.

### GitHub returns `bad_verification_code`

The `code` has already been exchanged once or has expired. Start the flow over. Codes are single-use.

### Sign-in succeeds but the app drops to the non-member blocking screen

Expected if the signed-in GitHub account is not a member of the `EmergentSoftware` org. An org owner must add them (GitHub → `EmergentSoftware` → People → Invite member) before they can use the app. This is not an OAuth App configuration problem.

### `client_secret` accidentally committed to a public location

Treat as compromised. Immediately:

1. Rotate per [§10](#10-rotating-a-client-secret) — generate the new secret and roll it out to the function before revoking the old one.
2. Revoke the old secret the moment the new one is live.
3. Scrub the secret from git history if it was committed to any repo we control (`git filter-repo` or GitHub's secret scanning remediation).
4. Audit recent sign-in activity in GitHub's audit log for anything suspicious during the exposure window.
