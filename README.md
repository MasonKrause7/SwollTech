# SwollTech

A training notebook for people who already write their workouts down. You plan a workout, the app walks you through it set by set at the gym, and your progress shows up as charts: estimated maxes, weekly volume, streaks, personal records and a consistency calendar.

It runs on the web and as an iOS/Android app. The phone works with no signal and syncs when it can.

## How it fits together

| Path | What it is |
| --- | --- |
| `apps/api` | FastAPI. Verifies Supabase Auth tokens and is the only writer of training data. |
| `apps/web` | React + Vite. Guided logger, workout editor, history, progress dashboard. |
| `apps/mobile` | Expo (React Native). Offline-first: SQLite on the phone plus a sync outbox. |
| `packages/metrics` | Shared math: Epley estimates, unit conversion, stats (streaks, records, volume), plate loading, and the guided-session rules. Used by web, phone, and mirrored by the API. |
| `packages/sync` | Offline outbox flush. A failed flush stays queued and replays on the next connection. |
| `packages/api-client` | Typed API client, checked against `openapi.json` by a contract test. |
| `supabase/migrations` | Postgres schema. Row-level security is on with no policies, so the public Data API cannot read training data. |

Auth is Supabase email and password. The API checks the token on every request (signature, audience, expiry, subject) and scopes every query to that user.

## Run it locally

You need Node 22, [uv](https://docs.astral.sh/uv/), and Docker (for the throwaway test database).

```bash
npm install
cp .env.example apps/api/.env        # fill in the Supabase values
cp .env.example apps/web/.env.local  # only the VITE_ lines matter here
```

API:

```bash
cd apps/api
uv sync
uv run uvicorn swolltech.main:app --reload --port 8000
```

Web: `npm run dev:web` (http://localhost:5173)

Phone: `npm run dev:mobile`, then open in Expo Go or a dev build. Set `EXPO_PUBLIC_API_URL` to your computer's LAN address, not `localhost`, when testing on a real phone.

### Working without Supabase

For quick local work you can skip Supabase entirely. Point `DATABASE_URL` at a local database, set `DEV_TOKEN_ENABLED=true` on the API and `VITE_DEV_LOGIN=true` / `EXPO_PUBLIC_DEV_LOGIN=true` on the clients. A "Use local test account" button appears on sign in. Leave all three off anywhere real.

```bash
npm run db:up                                      # Postgres on port 54329
cd apps/api
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:54329/swolltech_dev uv run python -m scripts.reset_local_db
# start the API against that database with DEV_TOKEN_ENABLED=true, then:
npm run seed:demo -- --email demo@example.com      # ten weeks of believable history
```

## Tests

```bash
npm run db:up        # once: starts the disposable test database
npm test             # shared packages, web, phone logic, then the API
npm run test:e2e     # Playwright: real API + real database + real browser
npm run typecheck    # every workspace
```

What is covered:

- **API (pytest, about 86% line coverage):** auth edge cases (expired, missing expiry, wrong audience or secret), per-user isolation on every resource, workout and session CRUD and validation, offline sync for every entity including conflicts, duplicates, deletes and malformed changes, stats and post-workout summaries, account deletion, media uploads, rate limiting.
- **Shared math (Vitest):** stats, plate loading and the guided-session rules. `fixtures/stats-golden.json` is checked by both the Python and TypeScript stats code so the phone and server always agree.
- **API client:** a contract test calls every client method and fails if any request doesn't match a route in `openapi.json`.
- **Web (Vitest + Testing Library):** the guided session flow (prefill, steppers, logging, rest timer, skipping, finishing), routing guards, auth forms, and each page.
- **Phone (Vitest):** session building from workouts, outbox merging, sync status, chunked secure storage, local stats, and payloads checked against the server's sync schema.
- **End to end (Playwright):** plan a workout, log it set by set, finish, beat it next time and see the record; cross-account isolation; unit switching; sign out; a phone-sized run.

The API suite refuses to run against Supabase. It only uses `TEST_DATABASE_URL`, because it drops and rebuilds the schema.

After changing API routes, regenerate the contract:

```bash
cd apps/api && uv run python -c "import json; from swolltech.main import app; json.dump(app.openapi(), open('../../packages/api-client/openapi.json','w'), indent=1)"
```

CI (`.github/workflows/ci.yml`) runs the API suite with an 80% coverage floor, every typecheck and unit suite, the web build, then the Playwright suite.

## Going to production

1. **Database:** apply `supabase/migrations` to the Supabase project (`supabase db push` or the SQL editor).
2. **Supabase Auth:** under Authentication, URL configuration, set the site URL to the web app's address and add `https://<your-web-domain>/update-password` and `swolltech://` to the redirect URLs. Turn on email confirmation.
3. **API:** deploy `apps/api` (a `Dockerfile` and `fly.toml` are included). Set `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_JWKS_URL`, `SUPABASE_JWT_SECRET` (only for projects still on the legacy HS256 secret), `SERVICE_ROLE_KEY` (needed so account deletion also removes the auth user), `CORS_ORIGINS` (your web domain), the `S3_*` values if you want set videos, and `SENTRY_DSN`. Keep `DEV_TOKEN_ENABLED` unset. `/health` is liveness, `/health/ready` also checks the database.
4. **Web:** `npm run build -w @swolltech/web` and host `apps/web/dist` on any static host with SPA fallback to `index.html`. Set the `VITE_` values at build time.
5. **Phone:** build with EAS (`eas build`) after setting the `EXPO_PUBLIC_` values. Bundle IDs are `com.swolltech.app`.

Known limits worth planning for: the rate limiter is in memory, so it is per API instance. Run one instance or move it to Redis before scaling out.
