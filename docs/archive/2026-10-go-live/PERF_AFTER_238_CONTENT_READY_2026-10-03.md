# Perf after #238 — content-ready metrics (2026-10-03)

**Prod tip:** `26b93de` (#238 recommendations non-blocking)  
**User:** sandbox manager · **n=3** hard navigations to `/dashboard`  
**Conditions:** Playwright Chromium, logged-in session, cold-ish `about:blank` between samples, measure after DOMContentLoaded + selectors.

## Metrics

| Sample | DCL ms | Content ready (h1) from DCL | Usable (table/KPI) from DCL | `/api/recommendations` duration | `scan` field |
|--------|--------|-----------------------------|------------------------------|----------------------------------|--------------|
| 1 | 855 | 206 | 383 | 4736 | null |
| 2 | 401 | 114 | 803 | 2232 | null |
| 3 | 293 | 94 | 321 | 1983 | null |
| **avg** | **516** | **138** | **502** | **2984** | null |

## Before (#238) — networkidle-dominated

| Route | Cold wall networkidle | recommendations |
|-------|----------------------|-----------------|
| /dashboard | ~9947 ms | 5–8 s **with sync detector scan** |

## Interpretation

- Primary UI becomes **usable in ~0.5–1.2 s after navigation start** (DCL + usable), vs ~10 s waiting on networkidle previously.
- `scan: null` confirms detectors are **not** awaited on default GET.
- Recommendations API still ~2–5 s (auth + DB) but **does not gate** content readiness.
- #239 (merged) further ensures `after()` keeps background work alive and logs failures to `system_logs`.

## Not claimed

- PWA SW stall fully closed (needs device check).
- p95 under load (isolated harness PR #240; not run against prod).
