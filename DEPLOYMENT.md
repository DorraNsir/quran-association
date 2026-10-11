# Deployment — Railway (API + PostgreSQL) and Vercel (website)

| Part | Host | Folder |
|---|---|---|
| NestJS API | Railway service | `backend/` (`backend/railway.json`) |
| PostgreSQL | Railway database | — |
| Uploaded files | Railway volume | mounted at `/data` |
| Next.js website + workspaces | Vercel | `frontend/` |

> **Use your own domain if you can** — for example `www.example.tn` (Vercel) and
> `api.example.tn` (Railway). The login session is kept by a cookie set by the API.
> With the default addresses (`*.vercel.app` + `*.up.railway.app`) that cookie is a
> *third-party* cookie: Safari and every browser on iPhone/iPad block it, so users there
> are logged out at every page reload. Two subdomains of one domain avoid this
> (and allow `REFRESH_COOKIE_SAMESITE=lax`).

---

## 0. Before deploying

1. Push the repository (with `backend/railway.json`) to GitHub.
2. Generate a JWT secret (keep it safe, never commit it):
   ```bash
   openssl rand -base64 48
   ```

## 1. Railway — database

1. New project → **Add PostgreSQL**.
2. Nothing else to configure. The API refers to it as `${{Postgres.DATABASE_URL}}`.

## 2. Railway — API service

1. **New → GitHub repo** → choose this repository.
2. Service **Settings**:
   - **Root Directory:** `/backend`
   - **Config file path:** `/backend/railway.json` (the config file does not follow the root directory)
   - **Networking → Generate domain** (or add `api.your-domain`). Note the URL.
3. **Volume:** right-click the service → **Attach volume** → mount path `/data`
   (uploaded photos, PDFs and the logo live there; without a volume they are lost at each deploy).
4. **Variables:**

   | Variable | Value |
   |---|---|
   | `NODE_ENV` | `production` |
   | `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
   | `JWT_ACCESS_SECRET` | the generated secret |
   | `FRONTEND_URL` | the website URL, e.g. `https://www.your-domain` (several: comma-separated, e.g. also `https://<project>.vercel.app`) |
   | `REFRESH_COOKIE_SAMESITE` | `lax` with your own domain (www. + api.) · `none` with vercel.app + railway.app |
   | `TRUST_PROXY` | `1` |
   | `FILE_STORAGE_ROOT` | `/data/uploads` |

   Optional (defaults are fine): `JWT_ACCESS_EXPIRES_IN=15m`, `REFRESH_TOKEN_EXPIRES_IN=7d`,
   `TEACHER_ATTENDANCE_WINDOW_DAYS`, `REGISTRATION_RATE_LIMIT_*`, `FILE_MAX_*`, … (see `backend/.env.example`).
   Railway sets `PORT` itself.

5. **Deploy.** For each deployment, Railway runs:
   - **build:** `npm run build`
   - **pre-deploy:** `npx prisma migrate deploy` (applies new migrations; never resets data)
   - **start:** `node dist/main.js`
   - **health check:** `GET /api/health`, which must answer before traffic switches.

6. Check `https://<api-domain>/api/health` → `{"status":"ok", …}`.

## 3. One time only — base data and the first administrator

Run both **once**, on the first deployment.

**Recommended — from the running service** (Railway CLI: `npm i -g @railway/cli`, then `railway login` and `railway link`):

```bash
railway ssh                 # opens a shell in the API container (in /app = backend/)
npm run admin:create        # asks: username, name, family name, temporary password (hidden, twice)
```

**Base data** (association settings, website settings, current academic year).
Run it from your computer, with the database's **public** URL
(Postgres service → Variables → `DATABASE_PUBLIC_URL`):

```bash
cd backend
npm ci
export DATABASE_URL='<DATABASE_PUBLIC_URL>'      # this terminal only — never commit it
NODE_ENV=production npm run db:seed               # creates only what is missing (re-runnable)
```

`admin:create` also works from your computer, in the same terminal: `npm run build && npm run admin:create`.

About `admin:create`:
- It refuses if an active administrator already exists. Later admins are granted in the platform:
  المعلمون → a teacher → «حساب الدخول» → «منح صلاحيات الإدارة».
- The password is never shown or stored in clear, and it must be changed at the first login.

## 4. Vercel — website

1. **Add New → Project** → import the repository.
2. **Root Directory:** `frontend` (framework detected: Next.js; build and output settings unchanged).
3. **Environment variable** (Production):

   | Variable | Value |
   |---|---|
   | `NEXT_PUBLIC_API_URL` | `https://<api-domain>/api` |

   It is built into the site: after changing it, **redeploy**.
4. **Deploy**, then add your domain in **Settings → Domains** if you have one.

## 5. Connect both sides

1. Make sure the API's `FRONTEND_URL` contains the exact website address (scheme + host, no trailing `/`).
   Railway redeploys automatically when a variable changes.
2. Open `https://<website>/login`, sign in with the admin created in step 3, and set your own password.

## 6. Check after the first deployment

- [ ] `/api/health` answers `ok`
- [ ] The public site shows the association name and pages (`/`, `/programs`, `/events`…)
- [ ] Login works, and **reloading the page keeps you logged in** (also test on an iPhone)
- [ ] Upload a photo (e.g. a graduate's) → it still shows after a new deploy (volume OK)
- [ ] The registration form accepts a request
- [ ] A scheduled announcement gets published

## 7. Later deployments

Push to GitHub: Railway and Vercel redeploy, and new migrations are applied automatically
(pre-deploy). The seed and `admin:create` are never needed again.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Logged out at every reload (Safari/iPhone) | Third-party cookie blocked → use your own domain (www. + api.), `REFRESH_COOKIE_SAMESITE=lax` |
| Logged out at every reload (all browsers) | `REFRESH_COOKIE_SAMESITE` must be `none` when the site and API are on different domains |
| Browser console: CORS error | `FRONTEND_URL` does not match the website address exactly |
| The site calls `localhost:4000` | `NEXT_PUBLIC_API_URL` missing on Vercel → set it and redeploy |
| Uploaded files disappear after a deploy | No volume, or `FILE_STORAGE_ROOT` not under `/data` |
| API does not start: "Invalid environment configuration" | A required variable is missing or malformed (the log names it) |
| Registrations refused too early ("too many requests") | `TRUST_PROXY=1` missing: every visitor looks like the same IP |
