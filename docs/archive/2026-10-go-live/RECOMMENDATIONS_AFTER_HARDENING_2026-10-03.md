# Recommendations `after()` hardening — 2026-10-03

## Context

Stale detector scans on `GET /api/recommendations` were moved off the request path in #238 (`cursor/go-buildings-closure-a926`, merged to `main`) so dashboard navigation is not blocked by `runClientDetectors`. Background work uses `runAfterResponse` → Next.js `after()` from `next/server`.

This hardening branch is based on `origin/main` after #238 so the non-blocking change is present.

## Why work can silently drop on Vercel Fluid / serverless

Vercel documents that `after()` (Next.js 15.1+) schedules side effects after the response and keeps the function alive for the duration of the returned Promise (Fluid / `waitUntil` under the hood). See:

- [Vercel Functions — `after()`](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package)
- [waitUntil](https://vercel.com/docs/functions/functions-api-reference)

**Bug fixed:** `runAfterResponse` previously did:

```ts
after(() => {
  void run() // Promise not returned → waitUntil may not extend lifetime
})
```

On Fluid/serverless, returning `undefined` from the `after` callback means the platform is not obligated to wait for detector work. The isolate can freeze/suspend and drop in-flight scans with only a best-effort `console.error` if anything failed — i.e. silent loss.

**Fix:** return the Promise:

```ts
after(() => run())
```

## Failure monitoring

On background task failure, `runAfterResponse` now:

1. `console.error('[runAfterResponse:<taskName>]', …)` (unchanged)
2. Inserts `system_logs` with `level: 'error'`
3. Optionally emails platform ops via `notifyPlatformOps` (`kind: 'operational_error'`, ~30 min dedupe)

### Recommendations detectors

| Field | Value |
|-------|--------|
| `system_logs.source` | `recommendations.detectors` |
| `system_logs.level` | `error` |
| Ops alert | yes (`alertOps: true`) |
| Title | `Recommendations detector scan failed` |
| Payload | `taskName`, `clientId`, `error`, optional `stack` |

Query recent failures (service role / SQL editor):

```sql
select created_at, level, source, message, payload
from system_logs
where source = 'recommendations.detectors'
  and level = 'error'
order by created_at desc
limit 50;
```

Other `runAfterResponse` callers get `system_logs` with default source `runAfterResponse.<taskPrefix>` unless they pass `logSource` / `alertOps`.

## Route behavior (unchanged contract)

| Request | Detector scan |
|---------|----------------|
| `GET` fresh cache | none |
| `GET` stale (`updated_at` older than 5 min) | `runAfterResponse` (non-blocking) |
| `GET ?refresh=1` | awaited inline; `scan` in JSON body |

## Tests

`tests/run-after-response.test.ts` (mocked `after()`):

- Schedules via `after()` and asserts the callback returns a `Promise`
- On throw: `system_logs` insert with `recommendations.detectors` + ops alert
- Fallback when `after()` throws (non-request scope)
- Sync kill-switch path (`SYNC_TICKET_NOTIFICATIONS=1`)

## Rollout / verify

1. Merge after (or stacked on) go-buildings non-blocking recommendations change.
2. Hit dashboard recommendations (stale tenant) — GET should return quickly with `scan: null`.
3. Confirm detectors refresh on a later GET / `?refresh=1`.
4. Force a detector failure in staging (or watch prod) → row in `system_logs` + ops email when `RESEND_API_KEY` is set.
