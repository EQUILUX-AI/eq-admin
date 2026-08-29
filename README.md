# eq-admin

Equilux admin portal — an OAuth2 login against **eq-auth** and energy dashboards
that chart data read from **eq-ai**.

Stack: Next.js 15 (App Router) · React 19 · Ant Design 5 · TanStack Query ·
Recharts. Mirrors the tiggie-monorepo admin app's conventions (OAuth password
grant, httpOnly-cookie sessions, `@/*` path alias).

## How it fits together

```
browser ──▶ eq-admin (Next.js)
              ├─ /api/login        ──▶ eq-auth  POST /o/token/   (password grant)
              └─ /api/eqai/[...]   ──▶ eq-ai     GET  /v1/metrics/…  (server-side proxy)
```

- **Login** posts `email`/`password` to `/api/login`, which does the OAuth2
  password-grant exchange with eq-auth (Basic client auth, `Equilux-Origin: ADMIN`
  header — the operator needs the `ADMIN` role). Access/refresh tokens land in
  **httpOnly cookies**; page JS never sees them.
- **Route protection** is `src/middleware.js` — `/dashboard` requires the access
  cookie, `/login` redirects away when already signed in.
- **Dashboard** calls `/api/eqai/metrics/{home_id}/…`, a server-side proxy that
  attaches the token and forwards to eq-ai. Charts:
  - weekly summary KPI tiles (import / generate / export / self-consumption / bill MTD)
  - daily energy timeseries (produced vs imported vs exported)
  - current device states table

## Setup

```sh
cd eq-admin
npm install
cp .env.example .env.local   # then fill in the values below
npm run dev                  # http://localhost:3005
```

### Environment

| Var | Meaning |
|-----|---------|
| `EQ_AUTH_URL` | eq-auth base URL, **trailing slash** (token endpoint is `${EQ_AUTH_URL}o/token/`) |
| `EQ_OAUTH_CLIENT_ID` / `EQ_OAUTH_CLIENT_SECRET` | a confidential eq-auth OAuth2 Application with the `password` grant |
| `EQ_AI_URL` | eq-ai base URL (e.g. `http://localhost:8000`) |
| `NEXT_PUBLIC_DEFAULT_HOME_ID` | optional default for the dashboard's home selector |

To create the OAuth client: in eq-auth's Django admin → **OAuth2 Provider →
Applications**, add one with client type *confidential* and grant type
*Resource owner password-based*. Give the login user the `ADMIN` group.

## Notes / first-version scope

- eq-ai's `/v1/metrics` endpoints are internal-plane and don't yet validate the
  bearer token (matching its existing telemetry/homes routers). The proxy already
  forwards the token, so introspection can be switched on in eq-ai without any
  change here.
- The home selector takes a `home_id` directly — eq-hub owns the home list and
  there's no list endpoint yet. Wire a `GET /v1/homes` proxy when one exists.
