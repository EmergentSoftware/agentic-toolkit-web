# ATK Auth Function

An Azure Function that brokers the GitHub OAuth code-for-token exchange for the
ATK Web SPA. The browser cannot call
`https://github.com/login/oauth/access_token` directly because that endpoint
requires the OAuth app's `client_secret`. This function holds the secret in
Function App application settings and exposes a single endpoint:

```
POST /api/auth/exchange
```

## Endpoint contract

**Request**

```http
POST /api/auth/exchange
Content-Type: application/json

{ "code": "<authorization code from GitHub redirect>" }
```

**Success response** (200)

```json
{
  "access_token": "gho_...",
  "scope": "read:org,repo",
  "token_type": "bearer"
}
```

The function forwards GitHub's response body as-is. Exact fields are whatever
GitHub returns on a successful exchange.

**Error envelope** (typed)

```json
{ "error": "<machine-readable code>", "message": "<human-readable message>" }
```

| Status | `error`                       | When                                                       |
| ------ | ----------------------------- | ---------------------------------------------------------- |
| 400    | `invalid_json`                | Request body was not valid JSON                            |
| 400    | `invalid_request`             | Zod validation of the body failed (e.g., missing `code`)   |
| 400    | `<github oauth error code>`   | GitHub returned an OAuth error (e.g., `bad_verification_code`) |
| 403    | `origin_not_allowed`          | Request `Origin` is not in the CORS allow-list             |
| 405    | `method_not_allowed`          | Method was not `POST` or `OPTIONS`                         |
| 500    | `server_misconfigured`        | `GITHUB_OAUTH_CLIENT_ID`/`GITHUB_OAUTH_CLIENT_SECRET` unset |
| 502    | `upstream_unavailable`        | `fetch` to GitHub threw (DNS, connection, TLS)             |
| 502    | `upstream_invalid_response`   | GitHub responded with non-JSON                             |
| 502    | `upstream_error`              | GitHub returned a non-2xx HTTP status                      |

## Application settings

Set these in Azure Function App configuration (for deployed environments) or in
`local.settings.json` (for local development). Copy
`local.settings.json.template` to `local.settings.json` — the latter is
`.gitignore`d and must never be committed.

| Key                          | Required | Description                                                                                      |
| ---------------------------- | -------- | ------------------------------------------------------------------------------------------------ |
| `GITHUB_OAUTH_CLIENT_ID`     | yes      | Client ID of the GitHub OAuth App that the SPA redirects users to.                               |
| `GITHUB_OAUTH_CLIENT_SECRET` | yes      | Client secret for the same OAuth App. Never commit. Rotate via the GitHub OAuth App settings.    |
| `CORS_ALLOWED_ORIGINS`       | yes      | Comma-separated list of origins allowed to call the function. `http://localhost:5173` is always implicitly allowed to simplify local dev. |
| `FUNCTIONS_WORKER_RUNTIME`   | yes      | Must be `node`.                                                                                  |
| `FUNCTIONS_NODE_VERSION`     | yes      | Must be `~20`.                                                                                   |

## Local development

### Prerequisites

- Node.js 20 LTS (matches the Function App runtime)
- [Azure Functions Core Tools v4](https://learn.microsoft.com/azure/azure-functions/functions-run-local)
- `pnpm` 10.5.2 (pinned via `packageManager` in `package.json`)
- A **dev GitHub OAuth App** registered out-of-band on your personal account.
  Use these settings:
  - Homepage URL: `http://localhost:5173`
  - Authorization callback URL: `http://localhost:5173/auth/callback`
  - Note the Client ID and generate a Client Secret; you will paste both into
    `local.settings.json`.

The dev OAuth App is yours, not a shared organization resource. Do not check
its secret into any repository.

### Setup

```bash
cd auth-function
pnpm install
cp local.settings.json.template local.settings.json
# edit local.settings.json — fill in GITHUB_OAUTH_CLIENT_ID and
# GITHUB_OAUTH_CLIENT_SECRET from your dev GitHub OAuth App.
pnpm build
func start
```

`func start` boots the Functions host on `http://localhost:7071`, exposing:

```
POST http://localhost:7071/api/auth/exchange
```

You can smoke-test a validation error without GitHub:

```bash
curl -i -X POST http://localhost:7071/api/auth/exchange \
  -H 'Origin: http://localhost:5173' \
  -H 'Content-Type: application/json' \
  -d '{"code":""}'
```

### Scripts

| Script            | What it does                                                            |
| ----------------- | ----------------------------------------------------------------------- |
| `pnpm build`      | Compile TypeScript to `dist/`                                           |
| `pnpm watch`      | Compile in watch mode                                                   |
| `pnpm start`      | Clean, build, then `func start` (Azure Functions Core Tools)            |
| `pnpm lint`       | Run ESLint over `src/`                                                  |
| `pnpm typecheck`  | `tsc --noEmit`                                                          |
| `pnpm test`       | Run Vitest unit tests (handler is mock-tested with `fetch` stubbed)     |
| `pnpm test:watch` | Vitest in watch mode                                                    |

## Logging

The function logs one structured JSON line per event via `context.log`.
Sensitive fields are redacted to `[REDACTED]` before emission. The redaction
list is:

- `code`
- `access_token`
- `refresh_token`
- `client_secret`
- `authorization` (case-insensitive header name)

Redaction applies recursively to any logged object, including upstream error
bodies. Nothing in this list is ever returned to the caller either — only the
typed error envelope above.

## SPA integration (Phase 8)

Phase 8 of the ATK Web phased plan wires the SPA callback handler to this
function. The SPA will read the function URL from a Vite env var:

```
# .env.local (SPA, Phase 8 — do NOT set in this package)
VITE_AUTH_FUNCTION_URL=http://localhost:7071/api/auth/exchange
```

In production the same variable will point at the deployed Function App,
e.g. `https://atk-auth.azurewebsites.net/api/auth/exchange`. The SPA is
expected to POST `{ "code": "..." }` with `Content-Type: application/json`
and an `Origin` header matching one of the `CORS_ALLOWED_ORIGINS` entries.
The function never sets cookies and the SPA must store the returned token
only in `sessionStorage` (see Phase 8 scope).

## Deployment

Out of scope for Phase 7. Production deployment to Azure is handled in
Phase 11 of the phased plan.
