# SwollTech

A training notebook for people who already write their workouts down. You plan a workout, the app walks you through it set by set at the gym, and your progress shows up as charts: estimated maxes, weekly volume, streaks, personal records and a consistency calendar.

It runs on the web and as an iOS/Android app. The phone works with no signal and syncs when it can.

## How it fits together

| Path | What it is |
| --- | --- |
| `apps/api` | FastAPI, deployed as a Vercel Python Function. Verifies Neon Auth tokens and is the only writer of training data. |
| `apps/web` | React + Vite. Guided logger, workout editor, history, progress dashboard. |
| `apps/mobile` | Expo (React Native). Offline-first: SQLite on the phone plus a sync outbox. |
| `packages/metrics` | Shared math: Epley estimates, unit conversion, stats (streaks, records, volume), plate loading, and the guided-session rules. Used by web, phone, and mirrored by the API. |
| `packages/sync` | Offline outbox flush. A failed flush stays queued and replays on the next connection. |
| `packages/api-client` | Typed API client, checked against `openapi.json` by a contract test, plus the Neon Auth REST client shared by web and phone. |
| `apps/api/migrations` | Postgres schema (Neon), applied by `python -m scripts.migrate`. Row-level security is on with no policies, so no other database role can read training data. |

Auth is Neon Auth (Managed Better Auth), email and password. Users live in the database's `neon_auth` schema. Clients exchange their session for 15-minute EdDSA JWTs; the API checks every one (signature via cached JWKS, issuer, audience, expiry, subject) and scopes every query to that user.

## Run it locally

You need Node 22, [uv](https://docs.astral.sh/uv/), and Docker (for the throwaway test database).

```bash
npm install
cp .env.example apps/api/.env        # local values, or `vercel env pull` for Neon
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

### Working without Neon

For quick local work you can skip Neon entirely. Point `DATABASE_URL` at a local database, set `DEV_TOKEN_ENABLED=true` and `DEV_JWT_SECRET=<any 32+ chars>` on the API and `VITE_DEV_LOGIN=true` / `EXPO_PUBLIC_DEV_LOGIN=true` on the clients. A "Use local test account" button appears on sign in. Leave all three off anywhere real.

```bash
npm run db:up                                      # Postgres on port 54329
cd apps/api
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:54329/swolltech_dev uv run python -m scripts.reset_local_db
# start the API against that database with DEV_TOKEN_ENABLED=true, then:
npm run seed:demo -- --email demo@example.com --fresh   # 18 months of believable history
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

The API suite refuses to run against a hosted (Neon or Supabase) database. It only uses `TEST_DATABASE_URL`, because it drops and rebuilds the schema.

After changing API routes, regenerate the contract:

```bash
cd apps/api && uv run python -c "import json; from swolltech.main import app; json.dump(app.openapi(), open('../../packages/api-client/openapi.json','w'), indent=1)"
```

CI (`.github/workflows/ci.yml`) runs the API suite with an 80% coverage floor, every typecheck and unit suite, the web build, then the Playwright suite.

## Going to production

Everything runs on Vercel (team `mason-krauses-projects`), Git-connected to this repo:

| Vercel project | Root | Production domain |
| --- | --- | --- |
| `swolltech-web` | `apps/web` | swolltech.com |
| `swolltech-api` | `apps/api` | api.swolltech.com |

Pushing a branch deploys a preview of both; merging to `master` deploys production.

1. **Database and auth (Neon via the Vercel Marketplace).** The `swolltech-db` Neon resource (region pdx1, Auth on) is connected to `swolltech-api` and sets `DATABASE_URL` (pooled, used at runtime), `DATABASE_URL_UNPOOLED` (direct, for migrations) and `NEON_AUTH_BASE_URL`. Apply migrations with the direct URL:
   ```bash
   vercel env pull --environment production /tmp/swolltech.env   # from a dir linked to swolltech-api
   set -a; . /tmp/swolltech.env; set +a
   cd apps/api && MIGRATION_DATABASE_URL="$DATABASE_URL_UNPOOLED" uv run python -m scripts.migrate
   rm /tmp/swolltech.env
   ```
   Or run the `migrate` GitHub workflow (secret `MIGRATION_DATABASE_URL` in the `production` environment).
2. **Neon Auth settings** (Neon console, opened from the Vercel Storage tab): add the web origins (`https://swolltech.com`, `https://www.swolltech.com`, and the preview pattern you use) to trusted domains, turn off localhost for production, set the app name, and decide on email verification. The phone sends `Origin: https://swolltech.com`, so it is covered by the same entry.
3. **API (`swolltech-api`).** A Vercel FastAPI function: `pyproject.toml` `[tool.vercel] entrypoint = "swolltech.main:app"`, `apps/api/vercel.json` pins region pdx1 (next to Neon us-west-2). Environment: the Neon values above, `SWOLLTECH_DEPLOYED=1`, `CORS_ORIGINS` (web origins), optional `CORS_ORIGIN_REGEX` (web previews), `KV_REST_API_URL`/`KV_REST_API_TOKEN` (Upstash Redis from the Marketplace, for rate limits), the `S3_*` values for set videos, `SENTRY_DSN`.
   - The API refuses to start if `DATABASE_URL` or `NEON_AUTH_BASE_URL` is missing on Vercel, `CORS_ORIGINS` only lists localhost, `DEV_JWT_SECRET` is set, or `DEV_TOKEN_ENABLED` is on anywhere but a local machine with a local database. It warns (and limits per instance) when Upstash is not configured.
   - Database TLS is always verified. Pools are small (2 + 3 per instance) because Neon's pooler does the pooling.
   - `/health` is liveness; `/health/ready` also checks the database.
   - Account deletion (`DELETE /v1/me`) removes all training data and the `neon_auth` user (sessions cascade) in one transaction, records a tombstone so still-valid JWTs are refused, then deletes the user's videos.
4. **Web (`swolltech-web`).** Needs `VITE_API_URL` and `VITE_NEON_AUTH_URL`; deployed builds fail without them, if they point at localhost, if dev login is on, or if `vercel.json`'s `/api/auth` rewrite does not point at `VITE_NEON_AUTH_URL`. The browser talks to Neon Auth through that same-origin rewrite so the session cookie is first-party. `/privacy`, `/terms` and `/support` are public pages (also the App Store privacy and support URLs).
5. **Phone.** The EAS project is linked (`owner` and `extra.eas.projectId` in `app.json`). `eas.json` sets `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_NEON_AUTH_URL` and `EXPO_PUBLIC_WEB_URL` per profile. Then `eas build -p ios --profile production` and `eas submit -p ios`. iPhone only (`supportsTablet: false`). Bundle IDs are `com.swolltech.app`.

CI also runs release checks: the API contract matches the routes, the API refuses an unsafe Vercel config, migrations apply to a fresh database, the phone bundle builds, and no high-severity vulnerabilities in shipped dependencies.

Preview deployments are behind Vercel Authentication. Use a protection-bypass token (Project Settings, Deployment Protection) for scripted checks against them.
