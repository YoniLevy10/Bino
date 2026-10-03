# Perf / PWA post-login evidence (2026-10-03)

## Before (prod `edd27bb`, sandbox manager)

Measured with Playwright full navigation to `networkidle`.

| Route | Cold wall ms | Warm wall ms | Notes |
|-------|--------------|--------------|-------|
| /dashboard | 9947 | 6127 | `/api/recommendations` 8255 / 5042 ms — **sync detector scan** |
| /tickets | 3341 | 2962 | |
| /collections | 3960 | 3093 | addon may be off; page still loads |
| /settings | 5853 | 2875 | `/api/settings/read` 4870 ms cold (likely cold-start) |
| /workers | 2702 | 2855 | |

- Duplicate `/api/*` URLs per navigation: **none** observed.
- Page JS errors: **none** in harness.
- HTML DCL generally &lt; 1s; wall time dominated by authenticated APIs.

## Root cause fixed in code (this branch)

`GET /api/recommendations` awaited `runClientDetectors` whenever recommendations were stale (&gt;5 min). That blocked dashboard for 5–8s.

**Change:** default GET returns cached rows immediately; stale refresh scheduled with `runAfterResponse`. Explicit `?refresh=1` still awaits a scan.

## After

**Pending deploy** of this branch to production, then re-run the same Playwright harness. Expect dashboard wall time to drop toward nav-config + page-view cost (~2–4s) when detectors are stale.

## Follow-ups (not blocking if after metrics OK)

- Cache `/api/client/nav-config` briefly client-side or edge.
- Investigate `/api/settings/read` cold latency (simple select — likely function cold start).
- PWA: push-permission banner present; no SW stall isolated in this pass.
