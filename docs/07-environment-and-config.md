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
| `FRONTEND_ORIGIN` | no | `http://localhost:5173` | CORS `origin` (single value, no credentials) |

Pool settings are hard-coded: `max: 10`, `idleTimeoutMillis: 30000`, `connectionTimeoutMillis: 5000`.

Other hard-coded runtime facts:
- Uploads go to `path.resolve(process.cwd(), "uploads", "observations")`. The directory is **not** created automatically (multer `diskStorage` with a destination *function* does not mkdir). Start the process from `backend/` and make sure the folder exists.
- `app.set("trust proxy", 1)` is already on, so `express-rate-limit` and `req.ip` work behind one reverse proxy.
- Auth rate limit: 20 requests / 15 min per IP on `/api/auth/*`.
- JSON body limit 1 MB; multipart photo limit 10 MB.

## Frontend environment variables

Vite only exposes variables prefixed `VITE_`, and they are baked in **at build time**.

| Variable | Read in | Default |
|---|---|---|
| `VITE_API_BASE_URL` | `src/services/apiClient.js` | `http://localhost:3000/api` |

`frontend/.env` currently defines `VITE_API_URL`, which nothing reads. Rename it to `VITE_API_BASE_URL` (tracked in the backlog).

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
