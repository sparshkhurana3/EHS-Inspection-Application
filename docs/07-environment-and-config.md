# 7. Environment and configuration

## Toolchain facts about this machine

| Tool | Version | Implication |
|---|---|---|
| Node (system) | v12.22.9 | **Cannot run this app natively.** Express 5 needs ≥18, Vite 8 / `@vitejs/plugin-react` 6 need `^20.19 \|\| >=22.12`, react-router 7 needs ≥20. Use Docker (see plan) or install Node 22 via nvm. |
| npm | 8.5.1 | Old but works for `npm ci`. npm ≥7 auto-installs peer deps, which is the only reason `react`/`react-dom` get installed (they are not declared in `frontend/package.json`). |
| Docker / Compose | 29.8 / v5.5.1 | Fine. Compose v2 syntax (`docker compose`, `compose.yaml`). |

A separate compose project named `ehs` (from `~/EHS Inspection`, a sibling implementation) is often running on this machine and holds host ports **8080** and **127.0.0.1:4000**. Pick different host ports or stop it before bringing this project up.

## Ports

| Service | Port | Set by |
|---|---|---|
| PostgreSQL | 5432 | `compose.yaml` publishes `5432:5432` |
| Backend API | 3000 | `PORT` env, default in `config/environment.js` |
| Vite dev server | 5173 (host `0.0.0.0`) | `vite.config.js` |
| Vite preview | 4173 | `vite.config.js` |

## Backend environment variables

Read once in `backend/src/config/environment.js` via `dotenv`; the object is frozen. Startup throws if a *required* variable is missing.

| Variable | Required | Default | Used for |
|---|---|---|---|
| `NODE_ENV` | no | `development` | `production` masks stack traces; `test` disables morgan |
| `PORT` | no | `3000` | listen port |
| `DATABASE_HOST` | **yes** | — | pg Pool |
| `DATABASE_PORT` | no | `5432` | |
| `DATABASE_NAME` | **yes** | — | |
| `DATABASE_USER` | **yes** | — | |
| `DATABASE_PASSWORD` | **yes** | — | |
| `DATABASE_SSL` | no | `false` | `"true"` → `ssl: { rejectUnauthorized: true }` |
| `JWT_SECRET` | **yes** | — | HS256 signing of access tokens |
| `JWT_EXPIRES_IN` | no | `8h` | token lifetime (jsonwebtoken format) |
| `PASSWORD_SALT_ROUNDS` | no | `12` | bcryptjs cost |
| `FRONTEND_ORIGIN` | no | `http://localhost:5173` | CORS `origin` (single value, no credentials); also the host the SSO redirects return to |

### Microsoft Entra ID single sign-on

All optional. Leave the first three unset and the app runs on passwords only and does not draw the SSO button; set *some* of the three and the process **fails at boot** rather than at the first sign-in. Administrator setup is [`guide.md`](../guide.md); the design is [18](18-entra-sso-plan.md).

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `ENTRA_TENANT_ID` | for SSO | — | Directory (tenant) ID; also pinned against the token's `tid` claim |
| `ENTRA_CLIENT_ID` | for SSO | — | Application (client) ID; the ID token's expected audience |
| `ENTRA_CLIENT_SECRET` | for SSO | — | **Secret.** Same class as `JWT_SECRET`: `.env` only, never committed |
| `ENTRA_REDIRECT_URI` | no | `http://localhost:8090/api/auth/entra/callback` | Must match a registered redirect URI character for character |
| `ENTRA_SCOPES` | no | `openid profile email` | No Graph permission is needed beyond `User.Read` |
| `ENTRA_ROLE_CLAIM` | no | `roles` | `groups` to drive roles from group object IDs instead |
| `ENTRA_ROLE_MAP` | no | empty | `DirectoryValue=APP_ROLE` pairs, comma separated. Unneeded when the Entra app roles are named after the app's role codes |
| `ENTRA_DEFAULT_ROLE` | no | `USER` | Role for someone with no recognised app role. **Empty refuses the sign-in** |
| `ENTRA_BUTTON_LABEL` | no | `Login with Entra SSO` | Button text |
| `ENTRA_AUTHORITY` | no | `https://login.microsoftonline.com` | Sovereign clouds only (`.us`, `login.partner.microsoftonline.cn`) |

Every optional Entra variable is read through `readOptional()`, because `compose.yaml` passes them as `${VAR:-}` and an unset one therefore arrives as an empty string, which `??` would accept.

Pool settings are hard-coded: `max: 15`, `idleTimeoutMillis: 30000`, `connectionTimeoutMillis: 5000`.

Other hard-coded runtime facts:
- Uploads go to `path.resolve(process.cwd(), "uploads", "observations")`. The directory is **not** created automatically (multer `diskStorage` with a destination *function* does not mkdir). Start the process from `backend/` and make sure the folder exists.
- `app.set("trust proxy", 1)` is already on, so `express-rate-limit` and `req.ip` work behind one reverse proxy.
- Auth rate limit: 20 requests / 15 min per IP on the password and signup routes. The SSO routes have their own, far looser limit (600 / 15 min) because a whole site shares one egress IP and they accept no guessable secret.
- JSON body limit 1 MB; multipart photo limit 10 MB.

## Frontend environment variables

Vite only exposes variables prefixed `VITE_`, and they are baked in **at build time**.

| Variable | Read in | Default |
|---|---|---|
| `VITE_API_BASE_URL` | `src/services/apiClient.js` | `/api` |

`frontend/.env` sets it to `http://localhost:3000/api` for `npm run dev`. The container build passes `/api` as a build arg, which takes precedence, so in Docker the browser is same-origin through nginx.

## Files that are committed but should not be

There is **no `.gitignore`** in this repository. Consequently these are tracked:

- `backend/.env` (contains the real JWT secret and DB password for local dev)
- `frontend/.env`
- `backend/uploads/observations/*.png` (user-uploaded photo)

`node_modules/` and `dist/` are not present locally so they have not been committed yet, but nothing prevents it. Adding a `.gitignore` and `git rm --cached` for the above is step 0 of the containerization work.

## Local (non-Docker) development, as it works today

```bash
docker compose up -d postgres                         # DB only
docker exec -i ehs_postgres psql -U ehs_app -d ehs_inspection \
    < database-backups/ehs_full_dump.sql              # first time only
cd backend  && cp .env.example .env && npm install && npm run dev
cd frontend && npm install && npm run dev             # http://localhost:5173
```

Requires Node ≥ 22 on the host. `npm run dev` in the backend is `node --watch src/server.js`.
