# 22. Entra sign-in through Microsoft Entra application proxy

Implementation plan. Builds on [18-entra-sso-plan.md](18-entra-sso-plan.md) and follows the layering in [02-architecture.md](02-architecture.md) and the conventions in `CLAUDE.md`.

**Goal**

Staff open the app on their phones at the Microsoft Entra application proxy URL:

```
https://sonaehsdriveline-sonagroup.msappproxy.net/
```

From there, **Login with Entra SSO** must work end to end and leave them signed in on the proxy URL. People who reach the app at its internal address (`FRONTEND_ORIGIN`, for example a PC on the company network) must keep signing in exactly as they do today.

## Why it fails today

The app knows one public address, `FRONTEND_ORIGIN` (`config/environment.js`), and builds every absolute URL in the single sign-on flow from it:

| Step | Code | Built from |
|---|---|---|
| 1. `GET /api/auth/entra/start` sends the browser to Microsoft with `redirect_uri=…` | `entra.client.js` `buildAuthorizationUrl` | `environment.entra.redirectUri`, which defaults to `FRONTEND_ORIGIN + /api/auth/entra/callback` |
| 2. Microsoft sends the browser to that `redirect_uri` | – | the **internal** address |
| 3. The server redeems the code, and must repeat the same `redirect_uri` | `entra.client.js` `redeemAuthorizationCode` | the same config value |
| 4. `GET /api/auth/entra/callback` sends the browser to `/auth/entra/callback?code=…` or `/sign-in?ssoError=…` | `auth.controller.js` `entraCallback`, `redirectToSignIn` | `environment.frontendOrigin` |

A phone on the proxy URL therefore starts on `msappproxy.net`, but Microsoft sends it back in step 2 to the internal address. That address is unreachable off the network and is not the proxy's origin, so the sign-in dies there.

Application proxy's "Translate URLs in headers" cannot rescue this. The internal address sits URL-encoded inside the `redirect_uri` *query parameter* of a Location header that points at `login.microsoftonline.com`, which the proxy does not rewrite. Step 4's redirect would also leave proxy users on the internal origin even if step 2 succeeded. The server also cannot tell which address the browser used: the proxy connector sends the internal host as `Host` by default.

## Decisions

| # | Decision | Why |
|---|---|---|
| D1 | **Several public origins.** `FRONTEND_ORIGIN` stays the *primary* origin. A new optional `FRONTEND_ADDITIONAL_ORIGINS` holds a comma-separated list of further `https://` origins that serve the same deployment, for example `https://sonaehsdriveline-sonagroup.msappproxy.net`. Together they form the **allowed origins** list. | Internal and proxy users keep working side by side, and adding a third address later is configuration, not code. |
| D2 | **The browser says which origin it is on.** `EntraSignInButton` navigates to `/api/auth/entra/start?origin=<window.location.origin>`. The server accepts the value only if it is **exactly** one of the allowed origins. | The SPA always knows its own origin. `Host` and `X-Forwarded-Host` are unreliable behind the proxy connector (see above). An allowlist keeps this from being an open redirect. |
| D3 | **A missing or unlisted `origin` falls back to the primary origin** and logs a `warn` naming the rejected value (truncated to 200 characters). It is never an error page. | It keeps today's behaviour for old cached bundles and direct links, and the log tells the administrator exactly which address to add. Redirecting to an unlisted origin would be an open redirect. |
| D4 | **The origin chosen at start is stored on the login session** (new nullable column `entra_login_sessions.public_origin`, migration 019; `NULL` means primary). The callback reads it back by `state` and uses it for the token redemption's `redirect_uri` and for every redirect after that. | Entra requires the token request's `redirect_uri` to equal the authorization request's. The session row is the one place that links the two requests, and it is already keyed by `state`. |
| D5 | **Redirect URI per origin** is `<origin>/api/auth/entra/callback`. `ENTRA_REDIRECT_URI`, when set, still overrides it **for the primary origin only**. | The override exists for a primary address that differs from the registered URI (docs/18). Additional origins have no such history, and one override for several origins would be wrong for all but one. |
| D6 | **CORS `origin` becomes the allowed-origins array** (the `cors` package accepts an array). | Same-origin requests through nginx do not need it, but `npm run dev` and any tool that sends `Origin` should see a consistent answer for every allowed origin. |
| D7 | Every allowed origin is validated at boot. It must parse with `new URL(value)`, equal its own `.origin` (no path, query or trailing slash), and use `https:`. The exception is `http://localhost[:port]`, which is kept for `npm run dev`. Duplicates are dropped. Any other value throws, so the backend fails fast like every other misconfiguration in `environment.js`. | A typo here would otherwise only show up as a sign-in failure on somebody's phone. |
| D8 | No change to password sign-in, the session envelope, the exchange endpoint or the frontend routes. The SPA calls `/api` relatively, so it already works on any origin. | The defect is only in the absolute URLs of the single sign-on round trip. |

Out of scope, recorded in `docs/09`:
- **Proxy hop and rate limits.** Every proxy user may share one `req.ip` (the connector's), because `trust proxy` is `1`. The single sign-on limiter (600 per 15 minutes) and the password limiter (20 per 15 minutes) then count all phone users together. Make the hop count configurable after measuring what `X-Forwarded-For` the connector actually sends.
- A custom domain on the proxy, which would remove the need for this change.

## Prerequisites outside the code (Entra / proxy administrator)

These go into `guide.md` step 3 and `SETUP-GUIDE.md` §11.5 (see [Documentation](#documentation-to-update-in-the-same-change)). The implementer cannot do them, but must list them in the hand-off.

1. In the **EHS app registration** (the one whose client id is `ENTRA_CLIENT_ID`, not the application proxy's own enterprise app), under **Authentication → Web → Redirect URIs**, add:
   `https://sonaehsdriveline-sonagroup.msappproxy.net/api/auth/entra/callback`
   Keep the existing internal URI.
2. The application proxy app publishes the site at the **root** (`https://sonaehsdriveline-sonagroup.msappproxy.net/` → `https://<internal address>/`). A path-based external URL (`…/ehs/`) would break the SPA's absolute `/assets` and `/api` paths. That is a different change and is not covered here.
3. **Translate URLs in headers** can stay at its default. After this change the app never puts the internal address in a header that a proxy user follows.
4. If the backend certificate is self-signed or from the company CA, either the connector server trusts it or **Validate backend TLS/SSL certificate** is turned off for this app.
5. `.env`:
   `FRONTEND_ADDITIONAL_ORIGINS=https://sonaehsdriveline-sonagroup.msappproxy.net`
   Then run `docker compose up -d` (`restart` does not re-read `.env`).

**Stopgap if this cannot ship immediately:** set `FRONTEND_ORIGIN` to the proxy URL and register its callback. Proxy users can then sign in, but anyone using the internal address with Entra will be sent to the proxy URL after signing in.

## Backend

### `config/environment.js`

- Next to `frontendOrigin`, read `FRONTEND_ADDITIONAL_ORIGINS` with `readOptional(…, "")`. Split on commas, trim, strip trailing `/`, and drop empties. Validate each value with a new `assertPublicOrigin(name, value)` (D7). Also run `FRONTEND_ORIGIN` itself through `assertPublicOrigin`, but allow `http://localhost` there because of the existing development default.
- Export:
  - `frontendOrigin` (unchanged, the primary);
  - `frontendOrigins`: frozen array, primary first, then the additional origins, duplicates removed.
- In `readEntraConfiguration`:
  - keep `redirectUri` (the primary's, honouring `ENTRA_REDIRECT_URI`) for compatibility;
  - add `redirectUriFor(origin)` as a **plain function on the module**, not on the frozen config object. It returns `entra.redirectUri` when `origin` is the primary, else `` `${origin}/api/auth/entra/callback` ``.
  - Simplest shape: `export function entraRedirectUriFor(origin)` in `environment.js`.
- Add `resolvePublicOrigin(candidate)`. It returns `{ origin, accepted }`: the candidate when it is in `frontendOrigins` (exact string match after stripping one trailing `/`), else the primary with `accepted: false`.

### `compose.yaml` and `.env.example`

- **compose.yaml:** pass `FRONTEND_ADDITIONAL_ORIGINS: ${FRONTEND_ADDITIONAL_ORIGINS:-}` to the backend, next to `FRONTEND_ORIGIN`.
- **.env.example:** under `FRONTEND_ORIGIN`, add a commented example of `FRONTEND_ADDITIONAL_ORIGINS`:
  ```
  # Other https:// addresses that serve this same deployment, comma-separated, for example the
  # Entra application proxy URL. Each needs <origin>/api/auth/entra/callback registered as a redirect URI.
  FRONTEND_ADDITIONAL_ORIGINS=
  ```

### Migration `019_add_entra_login_origin.sql`

```sql
/*
 * Which of the deployment's public origins a single sign-on started on
 * (docs/22). NULL means FRONTEND_ORIGIN, which is also what every row
 * written before this migration used.
 */
ALTER TABLE entra_login_sessions
ADD COLUMN IF NOT EXISTS public_origin VARCHAR(255);
```

It is idempotent like the others. The backend applies it on start.

### `auth/entra.repository.js`

- `mapLoginSession` adds `publicOrigin: row.public_origin`.
- `createLoginSession` takes `publicOrigin` and inserts it (`NULL` for the primary). Add the column to **every** `RETURNING` and `SELECT` list in the file, including `claimLoginSessionByState`, `lockLoginSessionByExchangeCode` and any others.
- New `findLoginSessionOriginByState(state, client = databasePool)` is a read-only `SELECT public_origin FROM entra_login_sessions WHERE state = $1`. It returns the string or `null` and claims nothing. The callback's error branches use it (Entra echoes `state` on errors too).

### `auth/entra.client.js`

`buildAuthorizationUrl({ state, nonce, codeChallenge, redirectUri })` and `redeemAuthorizationCode({ code, codeVerifier, redirectUri })` use the passed `redirectUri` instead of `entra.redirectUri`. `resolveIdentity` gains a `redirectUri` parameter and passes it through. Keep the comment on `redeemAuthorizationCode` and add one line explaining that the URI must match the one sent in the authorization request.

### `auth/entra.service.js`

- `startLogin({ redirectTo, origin })`:
  - `const { origin: publicOrigin, accepted } = resolvePublicOrigin(origin)`;
  - when `origin` was supplied and `!accepted`, call `logger.warn("Entra sign-in started from an origin that is not configured; using FRONTEND_ORIGIN.", { origin: String(origin).slice(0, 200) })`;
  - pass `redirectUri: entraRedirectUriFor(publicOrigin)` to `buildAuthorizationUrl`;
  - store `publicOrigin: publicOrigin === environment.frontendOrigin ? null : publicOrigin`.
- `completeCallback`: after claiming the session, `const publicOrigin = loginSession.publicOrigin ?? environment.frontendOrigin`. Pass `redirectUri: entraRedirectUriFor(publicOrigin)` to `resolveIdentity` and return `{ exchangeCode, redirectTo, publicOrigin }`.
- `completeCallback` throws `ENTRA_LOGIN_SESSION_INVALID` and other errors before or after the claim. To let the controller pick the right origin for its error redirect, add `export async function findOriginForState(state)`:
  - it returns `environment.frontendOrigin` when `state` is missing or not a string, when the lookup throws, or when the stored origin is no longer in `frontendOrigins` (configuration changed);
  - otherwise it returns the stored origin, or the primary when the stored value is `NULL`;
  - it never throws.

### `auth/auth.controller.js`

- `redirectToSignIn(res, error, origin = environment.frontendOrigin)` builds its URL from `origin`.
- `entraStart` calls `entraService.startLogin({ redirectTo: req.query.redirectTo, origin: req.query.origin })`. In its `catch`, use `resolvePublicOrigin(req.query.origin).origin` for the error redirect.
- `entraCallback`:
  - first line inside `try`: `const origin = await entraService.findOriginForState(req.query.state)`, declared with `let origin = environment.frontendOrigin` above the `try` so the `catch` sees it;
  - replace every `environment.frontendOrigin` in the function with `origin`, including both early `ssoError` redirects and the success redirect;
  - on success, prefer `result.publicOrigin` (identical, but it comes from the claimed row);
  - the `catch` calls `redirectToSignIn(res, error, origin)`.
- `entraExchange`, `login` and `signup` are unchanged.

### Routes

No validator on `/entra/start`. It is a browser navigation, so `validate`'s JSON 400 would strand the person on a raw error. `resolvePublicOrigin` treats a non-string or longer-than-255-character `origin` as missing (D3). Say so in a comment on the route.

### `app.js`

`cors({ origin: environment.frontendOrigins, … })`.

## Frontend

`features/auth/auth.service.js`:

```js
/**
 * The browser tells the server which of the deployment's addresses it
 * is on (the company network, or the Entra application proxy), so
 * Microsoft sends it back to the same one (docs/22).
 */
export function buildEntraSignInUrl() {
  const query = new URLSearchParams({
    origin: window.location.origin,
  });

  return `${API_BASE_URL}/auth/entra/start?${query.toString()}`;
}
```

No other frontend change. `EntraCallbackPage` and `apiClient` are already origin-relative.

## Documentation to update in the same change

- **`guide.md` step 3:** register one callback URI **per address** staff use. Give the proxy example, and add an `AADSTS50011` troubleshooting row that names `FRONTEND_ADDITIONAL_ORIGINS`. Fix the text at line ~263 ("The redirect URI the app sends is …") to describe the per-origin rule (D5).
- **`SETUP-GUIDE.md`:**
  - §4.1: add the `FRONTEND_ADDITIONAL_ORIGINS` row to the `.env` table;
  - §11.5: rewrite for the default `msappproxy.net` domain, using the prerequisites list above;
  - keep the custom-domain, same-as-`FRONTEND_ORIGIN` route as the alternative that needs no additional origin;
  - §12: add the checklist item "A phone signs in with Microsoft at the proxy URL and lands on the dashboard there".
- **`docs/07-environment-and-config.md`:** the new variable, and update the `FRONTEND_ORIGIN` row (CORS is now the list).
- **`docs/04-api-reference.md`:** `GET /api/auth/entra/start` takes optional `origin`, and the callback and error redirects go to the session's origin.
- **`docs/03-data-model.md`:** `entra_login_sessions.public_origin`.
- **`docs/18-entra-sso-plan.md`:** a one-line note at the top that docs/22 extends the redirect URI rule.
- **`docs/09-feature-refinement-backlog.md`:** the out-of-scope items above.
- **`docs/README.md`:** link this plan.
- **`CLAUDE.md`:** in the Entra bullet, replace "The redirect URI defaults to `FRONTEND_ORIGIN` + `/api/auth/entra/callback`" with the per-origin rule and `FRONTEND_ADDITIONAL_ORIGINS`. Bump "`docs/10` to `21`" to `22`.

## Acceptance checks

Run everything in the containers; host Node 12 cannot run the backend. There are no tests. Check with `curl` against `http://127.0.0.1:3000` and `docker compose logs backend`. Entra must be configured for the redirect checks: with no tenant set, `/entra/start` answers with the `ENTRA_NOT_CONFIGURED` sign-in redirect, which still exercises the origin choice. Use a throwaway tenant id, client id and secret if needed, because the authorization URL is built from the discovery document.

1. **Boot validation:**
   - `FRONTEND_ADDITIONAL_ORIGINS=https://a.example.com/path` makes the backend exit with a clear message;
   - so does `http://a.example.com`;
   - `https://a.example.com/` (trailing slash) is accepted and normalised.
2. **Start, proxy origin:** `curl -sI "http://127.0.0.1:3000/api/auth/entra/start?origin=https%3A%2F%2Fsonaehsdriveline-sonagroup.msappproxy.net"`. The `Location` contains `redirect_uri=https%3A%2F%2Fsonaehsdriveline-sonagroup.msappproxy.net%2Fapi%2Fauth%2Fentra%2Fcallback`, and the newest `entra_login_sessions` row has that `public_origin`.
3. **Start, primary or missing origin:** `redirect_uri` is the primary's (or `ENTRA_REDIRECT_URI`), and `public_origin` is `NULL`.
4. **Start, unlisted origin** (`origin=https://evil.example`): the primary is used and a `warn` line names `https://evil.example`.
5. **Callback error branches:**
   - `GET /api/auth/entra/callback?error=access_denied&state=<state from check 2>` → `302` to `https://sonaehsdriveline-sonagroup.msappproxy.net/sign-in?ssoError=…`;
   - the same request with an unknown `state` → the primary origin;
   - `?code=x&state=<state from check 2>` → the redemption fails, and the redirect goes to the proxy origin's `/sign-in`.
6. **CORS:** `curl -sI -H "Origin: https://sonaehsdriveline-sonagroup.msappproxy.net" http://127.0.0.1:3000/api/health` returns that value in `Access-Control-Allow-Origin`.
7. **Frontend:** the built bundle's sign-in button navigates to `/api/auth/entra/start?origin=https%3A%2F%2Flocalhost`. Check by loading https://localhost/sign-in, or by grepping the built JS for `auth/entra/start?`.
8. **End to end, needs the administrator:**
   - on a phone off the company network, open the proxy URL and sign in with Microsoft: the browser ends on `https://sonaehsdriveline-sonagroup.msappproxy.net/dashboard`, signed in;
   - on a PC on the internal address, sign-in still works and stays on the internal address;
   - password sign-in works on both.
9. **Migration 019** applies on start (`schema_migrations` count goes up by one), and a second start applies nothing.

## Open questions for the user

- **Q1** Is the application proxy app configured with **Microsoft Entra ID pre-authentication** or **passthrough**? Both work with this plan. With pre-authentication, phone users pass a Microsoft prompt at the proxy and then sign in to the app, normally silently. Confirm so the guide describes the right experience.
- **Q2** What is the proxy's **internal URL** (the address the connector calls)? It does not need to be in `FRONTEND_ADDITIONAL_ORIGINS`, but the guide should name it, and it decides the certificate question in prerequisite 4.
- **Q3** Should on-site PCs also move to the proxy URL eventually, so there is one address? If so, the stopgap becomes the end state and `FRONTEND_ADDITIONAL_ORIGINS` would hold the internal address instead.
