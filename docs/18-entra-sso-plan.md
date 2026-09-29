# Microsoft Entra ID single sign-on

**Status: implemented.** Entra ID is the primary authentication and
authorization source; username and password sign-in is retained as a
failsafe. The administrator-facing setup instructions are in
[`guide.md`](../guide.md) at the repo root — this document is the
developer's view of why it is built the way it is.

## The three decisions this rests on

Settled with the product owner before any code was written:

1. **Entra app roles are authoritative.** Every SSO sign-in rewrites
   that user's rows in `user_roles` from the token's `roles` claim. A
   role withdrawn in the admin centre is gone from the app at the
   person's next sign-in, and nobody edits the database to grant access.
2. **Password sign-in survives, for accounts that have a password.**
   Users provisioned through Entra never get one, so SSO is their only
   route. A deliberate handful of break-glass accounts keep passwords
   for the day Entra is unreachable.
3. **Accounts are provisioned just in time**, gated by Entra's own
   "Assignment required" setting. With roughly 2000 employees, nobody
   pre-registers, and the decision about who may reach the app belongs
   in the admin centre rather than in app code.

## Why the flow is server side

The authorization code flow with PKCE runs in the API, not in the
browser, and the single-page app never sees a Microsoft token.

- A SPA cannot hold a client secret. The API can, so the app registers
  as a confidential client, which is the stronger posture.
- Everything downstream — `authenticate`, `authorize`, all six feature
  modules — already speaks the app's own JWT. Ending the SSO flow by
  minting that same JWT meant **no change to any of it**. Both sign-in
  routes converge on `authSession.js` and are indistinguishable
  afterwards.
- Microsoft's tokens are used once, to establish identity, then
  discarded. Nothing from Microsoft is stored and Graph is never called.

### Handing the session to the browser

The callback cannot simply redirect with the JWT in the URL: that
writes a working credential into browser history and into every proxy
log between the server and the user. Instead the callback stores a
**one-time, two-minute code** (SHA-256 hashed at rest) and redirects
with that. The SPA POSTs it to `/api/auth/entra/exchange` and gets back
exactly the envelope `/api/auth/login` returns, so `authProvider` and
the storage keys are unchanged.

## Files

| File | Role |
|---|---|
| `backend/database/migrations/017_add_entra_identity.sql` | `users.entra_object_id`, and `entra_login_sessions` for the redirect round trip |
| `backend/src/config/environment.js` | `environment.entra`, fail-fast on partial configuration |
| `backend/src/modules/auth/entra.client.js` | Everything Microsoft-specific: discovery, PKCE, code redemption, ID token verification via `jose` |
| `backend/src/modules/auth/entra.service.js` | start / callback / exchange, provisioning, role mapping |
| `backend/src/modules/auth/entra.repository.js` | Login-session rows, account link and provision, role replacement |
| `backend/src/modules/auth/authSession.js` | Token, public user and redirect helpers shared by both sign-in routes |
| `frontend/src/features/auth/EntraSignInButton.jsx` | The button beneath the password form |
| `frontend/src/features/auth/EntraCallbackPage.jsx` | Public route `/auth/entra/callback`; trades the one-time code |

`authSession.js` was extracted from `auth.service.js` for the same
reason `closureStatus.js` was extracted from `closure.service.js`: two
services need it and neither should import the other.

## Endpoints

| Endpoint | Auth | Notes |
|---|---|---|
| `GET /api/auth/providers` | public | Whether to draw the button. Reveals nothing else |
| `GET /api/auth/entra/start` | public | Browser navigation. 302 to Entra. Failures 302 to `/sign-in?ssoError=` |
| `GET /api/auth/entra/callback` | public | Browser navigation. Redeems the code, 302s to the SPA with a one-time code |
| `POST /api/auth/entra/exchange` | public | Returns `{ message, token, user, redirectTo }`, same shape as login |

The first two answer with redirects rather than JSON because the browser
visits them directly, which means they bypass `errorHandler` and mask
their own 5xx detail.

## Security properties, and where each is enforced

| Property | Where |
|---|---|
| PKCE S256 | `createPkcePair`, verified by Entra |
| ID token signature, `iss`, `aud`, `exp` | `jose.jwtVerify` against the tenant's JWKS |
| `nonce` replay guard | `verifyIdentityToken` |
| **Tenant pinning (`tid`)** | `verifyIdentityToken` — without it, matching accounts on email would be an account takeover, since any Microsoft tenant's token would otherwise satisfy the other checks |
| Single-use sign-in | `claimLoginSessionByState`, one atomic UPDATE |
| Single-use session handoff | `exchange_code_hash`, consumed in a transaction |
| Open redirect | `sanitizeRedirectPath` — app-relative paths only, applied on the way in and on the way out |
| Secret containment | Client secret only in `.env`; Entra's diagnostics go to the log, never into a response, because `errorHandler` serialises `details` to the browser |

### Two deliberate choices worth knowing

- **The state is claimed before the network calls, not inside a
  transaction.** Redeeming the code is two HTTPS round trips to
  Microsoft; holding a pool connection across them would exhaust the
  15-connection pool during a Monday shift change. The claim is one
  atomic statement, and the account work happens in its own transaction
  afterwards.
- **The SSO rate limit is separate and far looser** (600 per 15 minutes
  against the password form's 20). Everyone on a company network shares
  one egress address, so a limit sized for password guessing would lock
  out the whole site. The SSO endpoints accept no guessable secret —
  `state` and the exchange code are 256-bit values the server issued.

## Role mapping

`roles` claim → `ENTRA_ROLE_MAP` translation → `normalizeRole` → kept
only if it is one of the five codes in `shared/constants/roles.js`
(`USER`, `EHS_OFFICER`, `HOD`, `PLANT_HEAD`, `ADMIN`).

- Unrecognised values are **dropped and logged**, not rejected: a typo
  in the Entra manifest must not be able to lock everyone out. That
  includes `ACTION_HOD`, which migration 018 removed with the ticket
  system; an Entra role still carrying that value now grants nothing.
- An empty result falls back to `ENTRA_DEFAULT_ROLE` (`USER` by
  default); setting it empty refuses the sign-in instead. compose.yaml
  passes it as `${ENTRA_DEFAULT_ROLE-USER}` so that an empty value in
  `.env` survives interpolation.

## Account matching

`entra_object_id` (the immutable `oid` claim) first, then email. Email
is trusted **only** because the token has already been proved to come
from the configured tenant.

An existing local account matched by email is linked in place: it keeps
its `password_hash` and its `authentication_source` stays `LOCAL`, so it
retains both routes in. Only accounts the app itself provisions get
`authentication_source = 'ENTRA'` and no password. If the email is
already linked to a *different* `oid`, the sign-in is refused rather
than re-pointed.

## Verified

Exercised against a mock Entra serving the real OIDC endpoints with
genuine RS256 signing over JWKS, so token verification ran for real.
Confirmed: JIT provisioning; role sync both granting and withdrawing;
`ACTION_HOD` exclusivity; default role for an unassigned user; unknown
role values ignored; foreign-tenant token refused; callback replay
refused; exchange-code replay refused; fabricated exchange code refused;
open redirect stripped; second Microsoft account claiming a linked email
refused; existing local account linked with its password still working;
Entra-provisioned account refused at the password form; and, with Entra
unreachable, the start endpoint returning the failsafe message while
password sign-in kept working. The button and the completed sign-in were
confirmed in a real browser.

## Known limitations

- **Sign-out is local only.** Clearing the token ends the app session
  but not the Microsoft session, so pressing the button again may sign
  the person straight back in. Front-channel logout is not wired up.
- **`plant_id` is not set from Entra.** A just-in-time account gets
  none, and the roster matches people only at the officer's plant, so
  staff are imported with their plant beforehand
  (`scripts/admin.js import-users`, SETUP-GUIDE.md §9). Mapping it from
  a directory attribute is the obvious next step.
- **Disabling someone in Entra stops new sign-ins only.** The app's own
  session lasts up to `JWT_EXPIRES_IN` (8 h); `admin.js deactivate-user`
  cuts it off at the next request.
- **Self sign-up closes once Entra is configured** (`SELF_SIGNUP_ENABLED`
  overrides), because an open sign-up page would let anyone create a
  password account that a colleague's first SSO sign-in then links to.
- **A warm discovery cache masks an Entra outage at `/start`.** The
  browser is redirected to Microsoft and discovers the outage there,
  rather than being told up front. Only a cold backend reports it
  immediately. The password form is on the page either way.
- **The client secret expires.** Nothing in the app warns about it;
  `guide.md` asks the administrator to diary the renewal.
