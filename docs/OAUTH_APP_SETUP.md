# GitHub OAuth App Setup — Run Sheet

This run sheet walks through registering the **dev** and **production** GitHub OAuth Apps that back ATK Web's sign-in flow, and wiring their credentials into the ATK API and the SPA.

Two OAuth Apps are required — one for local development, one for production — so that local experimentation never hits the production callback URL and so that rotating one secret never disrupts the other environment. Each OAuth App is paired with one ATK API environment: **dev app ↔ dev API** (`func-atk-dev`), **prod app ↔ prod API** (`func-atk-prod`).

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Concepts](#2-concepts)
3. [Register the DEV OAuth App](#3-register-the-dev-oauth-app)
4. [Wire DEV credentials into the dev ATK API](#4-wire-dev-credentials-into-the-dev-atk-api)
5. [Wire DEV credentials into the SPA](#5-wire-dev-credentials-into-the-spa)
6. [Verify the DEV end-to-end handshake](#6-verify-the-dev-end-to-end-handshake)
7. [Register the PROD OAuth App](#7-register-the-prod-oauth-app)
8. [Wire PROD credentials into the prod ATK API](#8-wire-prod-credentials-into-the-prod-atk-api)
9. [Wire PROD credentials into the SPA build](#9-wire-prod-credentials-into-the-spa-build)
10. [Rotating a client secret](#10-rotating-a-client-secret)
11. [Revoking / deleting an OAuth App](#11-revoking--deleting-an-oauth-app)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Prerequisites

Before starting, confirm you have:

- [ ] **Owner** permission on the `EmergentSoftware` GitHub organization (required to register an org-owned OAuth App and to add production variables to the `agentic-toolkit-web` repo).
- [ ] **Contributor** access to the `EmergentSoftware/agentic-toolkit-web` repository.
- [ ] Access to the `Emergent.AgenticToolkit` monorepo in Azure DevOps and permission to set Key Vault secrets and Terraform variables for the ATK API (see its `infra/README.md`).
- [ ] A password manager or other secure secret store (for stashing each OAuth App's `client_secret`, which is shown **exactly once** at creation).
- [ ] Locally: Node.js `>= 24.x` and `pnpm` `10.5.2`.

> **Tip:** Register both OAuth Apps under the **EmergentSoftware org**, not under a personal account. Personal-account OAuth Apps disappear with the account and can't be transferred cleanly.

---

## 2. Concepts

| Term | Meaning |
|---|---|
| **OAuth App** | A GitHub registration that issues `client_id` / `client_secret` pairs and a callback URL. Users authorize the app; GitHub then redirects to the callback URL with a short-lived `code`. |
| **`client_id`** | Public identifier for the OAuth App. Embedded in the SPA at build time via `VITE_GITHUB_OAUTH_CLIENT_ID`, and configured on the matching ATK API environment. Not a secret. |
| **`client_secret`** | Secret identifier that proves the exchange request is legitimate. **Must never ship to the browser.** Held only by the ATK API (Key Vault). |
| **Authorization callback URL** | Where GitHub redirects after the user consents. Must exactly match the SPA's runtime origin + `/#/auth/callback` (the hash route is because ATK Web uses `HashRouter`). |
| **`code`** | A one-time, short-lived token the SPA receives in the callback URL. The SPA `POST`s it to the ATK API (`/auth/github/exchange`), which exchanges it for an `access_token` by calling GitHub with the `client_secret`. |
| **`access_token`** | A GitHub user access token scoped to `read:org` and `repo`. Stored in `sessionStorage` in the browser and sent to the ATK API as `Authorization: Bearer …`. Never persisted server-side. |
| **`VITE_ATK_API_URL`** | Base URL of the ATK API the SPA talks to: the dev API locally, the prod API on GitHub Pages. |

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

## 4. Wire DEV credentials into the dev ATK API

The dev API (`https://func-atk-dev.azurewebsites.net`) holds the dev OAuth App's credentials. In the `Emergent.AgenticToolkit` monorepo:

1. Set `github_oauth_client_id` in `infra/envs/dev/main.tf` to the DEV client id and apply (or set the Function App setting directly if Terraform is not being run).
2. Set the Key Vault secret `github-oauth-client-secret` in the **dev** Key Vault to the DEV client secret.
3. Confirm `cors_allowed_origins` on the dev Function App includes `http://localhost:5173`.

See the monorepo's `infra/README.md` for the exact commands. Nothing in this repo needs the secret.

---

## 5. Wire DEV credentials into the SPA

The SPA needs the DEV `client_id` (public) and the dev API URL (public) at dev server startup.

1. From the repo root:

   ```bash
   cp .env.example .env.local
   ```

2. Open `.env.local` and fill in:

   ```bash
   VITE_GITHUB_OAUTH_CLIENT_ID=<paste DEV client_id here>
   VITE_ATK_API_URL=https://func-atk-dev.azurewebsites.net
   ```

   To run against a local `func start` of the API instead, use `http://localhost:7071`.

3. Confirm `.env.local` is git-ignored (Vite projects ignore `.env.local` by default; verify with `git status`).

> `VITE_ATK_API_URL` is the base URL with **no `/api` prefix and no trailing slash**. The SPA appends `/auth/github/exchange`, `/me`, `/registry`, etc. itself.

---

## 6. Verify the DEV end-to-end handshake

1. Start the SPA:

   ```bash
   pnpm install
   pnpm dev
   ```

   Expect Vite to print `Local: http://localhost:5173/`.

2. In the browser, open `http://localhost:5173`, click **Sign in with GitHub**, and complete consent.
3. On the callback, open the browser devtools **Network** tab and confirm:
   - A `POST https://func-atk-dev.azurewebsites.net/auth/github/exchange` request fires.
   - The response is `200 OK` with a JSON body containing `access_token`.
   - The response **does not** include a `Set-Cookie` header or any reflection of `client_secret`.
   - A `GET https://func-atk-dev.azurewebsites.net/me` request follows with an `Authorization: Bearer …` header and returns `200` with your login.
4. Confirm the SPA advances past the sign-in screen. If it lands on the org-membership blocking screen, that is expected for any account that isn't a member of `EmergentSoftware` (the API answered `403`).

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

## 8. Wire PROD credentials into the prod ATK API

Never commit the production `client_secret`. It lives only in the prod Key Vault.

1. In the monorepo, set `github_oauth_client_id` in `infra/envs/prod/main.tf` to the PROD client id and apply.
2. Set the Key Vault secret `github-oauth-client-secret` in the **prod** Key Vault to the PROD client secret.
3. Confirm `cors_allowed_origins` on the prod Function App includes `https://emergentsoftware.github.io`.
4. Verify:

   ```bash
   curl -i -X OPTIONS https://func-atk-prod.azurewebsites.net/auth/github/exchange \
     -H "Origin: https://emergentsoftware.github.io" \
     -H "Access-Control-Request-Method: POST"
   ```

   The response should include `Access-Control-Allow-Origin: https://emergentsoftware.github.io`. **It must not** echo `*` and must not echo any other origin.
5. Confirm that no Application Insights log entry from the API contains the literal value of the client secret, any `code` value, or any `access_token` value. If any of these leak, stop and file a rotation ticket before continuing (see [§10](#10-rotating-a-client-secret)).

---

## 9. Wire PROD credentials into the SPA build

The GitHub Pages deploy workflow injects these at build time.

1. Navigate to **`https://github.com/EmergentSoftware/agentic-toolkit-web/settings/variables/actions`**.
2. Add the following **repository variables** (Variables, not Secrets — both values are public and end up in the compiled bundle):

   | Variable name | Value |
   |---|---|
   | `VITE_GITHUB_OAUTH_CLIENT_ID` | `<PROD client_id>` |
   | `VITE_ATK_API_URL` | `https://func-atk-prod.azurewebsites.net` |

   Or from a terminal with the `gh` CLI:

   ```bash
   gh variable set VITE_GITHUB_OAUTH_CLIENT_ID --body <PROD client_id>
   gh variable set VITE_ATK_API_URL --body https://func-atk-prod.azurewebsites.net
   ```

3. `deploy-pages.yml` passes these straight to `pnpm build`. No other SPA-side action is needed.

> `VITE_GITHUB_OAUTH_CLIENT_ID` is public — it ends up in the compiled JavaScript bundle. GitHub's OAuth model assumes the `client_id` is visible to the browser; security comes from the `client_secret` staying server-side.

---

## 10. Rotating a client secret

Rotate on a schedule (every 90 days is a reasonable cadence) and immediately if a secret is suspected of being exposed (leaked to logs, committed to a repo, shared over an unencrypted channel, etc.).

**Rotate the DEV secret:**

1. GitHub → OAuth App **ATK Web (dev)** → **Generate a new client secret**.
2. Copy the new value into your password manager.
3. Update `github-oauth-client-secret` in the dev Key Vault; restart the dev Function App if needed.
4. Sign in locally to confirm the exchange still works.
5. Return to the old secret on the GitHub page and click **Revoke** on the old secret row.

**Rotate the PROD secret:**

1. GitHub → OAuth App **ATK Web** → **Generate a new client secret**. (GitHub allows two secrets to coexist during rotation.)
2. Copy the new value into the password manager.
3. Update `github-oauth-client-secret` in the prod Key Vault; restart the prod Function App if needed.
4. Verify sign-in still works end-to-end on the production URL.
5. Return to the GitHub OAuth App page and click **Revoke** on the old secret row.

**Do not** revoke the old secret before the new one is live in the API — doing so causes a brief outage where every sign-in fails.

---

## 11. Revoking / deleting an OAuth App

If an OAuth App must be retired (e.g., the callback URL permanently changed and a new app was registered to replace it):

1. Communicate the change ahead of time — all active user sessions will eventually need to re-authorize against the new app.
2. GitHub → OAuth App → **Delete application** at the bottom of the settings page. Confirm by typing the app name.
3. Clean up any `client_id` / `client_secret` references in the API's Terraform variables and Key Vault, local `.env.local`, and GitHub Actions variables.
4. Remove any password-manager entries that reference the retired app.

---

## 12. Troubleshooting

### "The redirect_uri MUST match the registered callback URL for this application."

The callback URL registered on the OAuth App does not exactly match what the SPA passes at authorize time. Checklist:

- The URL uses the **hash** fragment (`/#/auth/callback`), not a path fragment (`/auth/callback`).
- Protocol matches (`http://` for local, `https://` for prod).
- Host matches (`localhost:5173` with the explicit port; no trailing slash).
- GitHub trims trailing whitespace poorly — re-enter the value if copy-paste introduced a stray space.

### `Auth exchange failed (HTTP 400): …` on `POST /auth/github/exchange`

Usually a bad or expired `code` (`bad_verification_code`). Codes expire after ~10 minutes and are single-use. Start the flow over from the sign-in button. If the error persists:

- Confirm the SPA's `VITE_GITHUB_OAUTH_CLIENT_ID` and the API environment's client id come from the **same** OAuth App (dev SPA ↔ dev API, prod SPA ↔ prod API — not mixed).
- Confirm the SPA is sending the `code` it just received, not a cached value.

### `Auth exchange failed (HTTP 500)`

The API environment is missing its OAuth configuration (`server_misconfigured`). Check the Terraform variable and the Key Vault secret for that environment.

### `CORS` preflight fails in the browser

- Confirm the API's `cors_allowed_origins` exactly matches the browser's `Origin` header, including scheme and port — no wildcards, no trailing slash.
- If behind a corporate proxy that rewrites `Origin`, test from a different network to rule out network-layer interference.

### Sign-in succeeds but the app drops to the non-member blocking screen

Expected if the signed-in GitHub account is not a member of the `EmergentSoftware` org (`GET /me` → `403 not_org_member`). An org owner must add them (GitHub → `EmergentSoftware` → People → Invite member) before they can use the app.

If the account **is** a member, the API answered `403 org_membership_unverifiable`: either SAML SSO has not been authorized for the token, or the OAuth App is not approved for the org (`https://github.com/orgs/EmergentSoftware/policies/applications`). The browser console logs which hint applies.

### `client_secret` accidentally committed to a public location

Treat as compromised. Immediately:

1. Rotate per [§10](#10-rotating-a-client-secret) — generate the new secret and roll it out to the API before revoking the old one.
2. Revoke the old secret the moment the new one is live.
3. Scrub the secret from git history if it was committed to any repo we control (`git filter-repo` or GitHub's secret scanning remediation).
4. Audit recent sign-in activity in GitHub's audit log for anything suspicious during the exposure window.
