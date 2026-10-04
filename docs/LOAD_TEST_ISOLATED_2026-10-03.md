# Isolated load-test harness (2026-10-03)

**Purpose:** measure public `/login` TTFB and (optionally) auth/write paths **without ever putting load on production Bamakor or `bino.casa`**.

**Related:** remediation plan P13 (scale / load) — [`BINO_REMEDIATION_PLAN_2026-10-03.md`](./BINO_REMEDIATION_PLAN_2026-10-03.md).

---

## Hard rules (non-negotiable)

1. **Default target is local only:** `BASE_URL=http://127.0.0.1:3000`.
2. **`https://bino.casa` is always refused**, including when `ALLOW_PROD_LOAD=I_UNDERSTAND`.
3. **Supabase project hosts** (`.supabase.co`, Bamakor project ref `jsliqlmjksintyigkulq`) hard-fail unless `ALLOW_PROD_LOAD=I_UNDERSTAND` — and that override is only for exceptional non-`bino.casa` staging experiments, **not** for Bamakor production load.
4. **Sandbox-on-prod-DB is not a load target.** The sandbox client UUID below may exist in production for soft-launch practice; **do not** point this harness at production (or a Vercel preview that shares the prod DB) to generate tickets against it.
5. Prefer **local Next + local Supabase** (`supabase start`) for any write scenario.

Sandbox client id used by the write gate:

```text
a1111111-1111-4111-8111-111111111111
```

---

## Layout

| Path | Role |
|------|------|
| `scripts/load/guard.mjs` | URL / write safety gates |
| `scripts/load/run.mjs` | autocannon runner (primary) |
| `scripts/load/mock-auth-server.mjs` | local mock for auth API scenario |
| `scripts/load/k6-login.js` | optional k6 `/login` script |
| `scripts/load/guard.test.mjs` | unit tests for the guard |

---

## Prerequisites

```bash
# App under test (separate terminal)
npm run dev
# or: npm run build && npm start

# Install load tool (devDependency)
npm i -D autocannon
```

Optional: [k6](https://k6.io/docs/get-started/installation/) for `scripts/load/k6-login.js`.

---

## How to run (local)

### Safe default — public `/login` TTFB only

```bash
npm run load:isolated
# equivalent:
# BASE_URL=http://127.0.0.1:3000 node scripts/load/run.mjs
```

Authenticated dashboard APIs are **skipped** unless one of:

```bash
# A) Real local session cookie (from browser DevTools on 127.0.0.1)
LOAD_AUTH_COOKIE='sb-xxx-auth-token=...' npm run load:isolated

# B) In-process mock (never hits Supabase / prod)
LOAD_USE_AUTH_MOCK=1 npm run load:isolated
```

### Public report `POST /api/create-ticket` (writes)

Only when **both** are true:

- `LOAD_ALLOW_WRITES=1`
- `LOAD_CLIENT_ID` is exactly `a1111111-1111-4111-8111-111111111111` (default)

```bash
# Local app + local DB only — NOT production Bamakor
LOAD_ALLOW_WRITES=1 \
LOAD_CLIENT_ID=a1111111-1111-4111-8111-111111111111 \
LOAD_PROJECT_CODE=SANDBOX01 \
npm run load:isolated
```

Even with the sandbox UUID, **do not** run this against `bino.casa` or any host wired to the production Supabase project. The guard will refuse `bino.casa`; treat sandbox-on-prod as equally off-limits by policy.

### Optional k6

```bash
BASE_URL=http://127.0.0.1:3000 k6 run scripts/load/k6-login.js
```

---

## Environment reference

| Variable | Default | Meaning |
|----------|---------|---------|
| `BASE_URL` | `http://127.0.0.1:3000` | Target origin (must pass guard) |
| `ALLOW_PROD_LOAD` | _(unset)_ | Must be `I_UNDERSTAND` to allow Supabase-looking hosts; **still refuses `bino.casa`** |
| `LOAD_AUTH_COOKIE` | _(unset)_ | Cookie header for authenticated paths; if unset, auth scenario skipped (unless mock) |
| `LOAD_USE_AUTH_MOCK` | _(unset)_ | `1` = spin local mock APIs instead of skipping auth |
| `LOAD_AUTH_PATHS` | `/api/health,/dashboard` | Comma-separated paths when cookie set |
| `LOAD_ALLOW_WRITES` | _(unset)_ | `1` = enable create-ticket scenario |
| `LOAD_CLIENT_ID` | sandbox UUID above | Must match sandbox UUID for writes |
| `LOAD_PROJECT_CODE` | `SANDBOX01` | `project_code` in create-ticket body |
| `LOAD_CONNECTIONS` / `LOAD_DURATION_SEC` | `10` / `10` | Global autocannon defaults |
| `LOAD_LOGIN_*` / `LOAD_AUTH_*` / `LOAD_WRITE_*` | see `run.mjs` | Per-scenario overrides |

---

## What “good” looks like

- Guard unit tests pass: `npx vitest run scripts/load/guard.test.mjs`
- Accidental `BASE_URL=https://bino.casa` exits non-zero with `HARD FAIL`
- Local `/login` run prints p50/p95 waiting (TTFB proxy via autocannon latency) without touching production

---

## Out of scope

- Load against Vercel production / Bamakor live tenants
- Cold WhatsApp / SMS blast under load
- Creating paid Supabase preview branches for load (forbidden — see CLAUDE.md)

---

## Verification run (2026-10-03 closure)

| Check | Result |
|-------|--------|
| `vitest run scripts/load/guard.test.mjs` | **7/7 pass** |
| `BASE_URL=https://bino.casa node scripts/load/run.mjs` | **HARD FAIL** (refused) |
| Mock HTTP `127.0.0.1:3456` 10s × 10 conn | ~59.6k rps, 0 errors — proves runner only |
| Real Next local capacity | **Not measured** this run (local `.next` start failed with `renderToPipeableStream`) |

Target-load **Go** still requires a healthy local Next + local Supabase measurement (see [`GO_NO_GO_2026-10-03.md`](./GO_NO_GO_2026-10-03.md)).
