# BINO Performance Audit — Supabase / Data Fetching

**Date:** 2026-09-24  
**Scope:** Authenticated manager app data loading (no UI redesign, no deploy, no large architectural rewrite yet).  
**DB:** Bamakor (`jsliqlmjksintyigkulq`, `ap-northeast-1`)  
**Method:** Static route inventory + provider/middleware analysis + Supabase performance advisors + index/RLS inspection.

---

## Executive verdict

Slowness is **not** primarily “Postgres is slow on large tables.” Current table sizes are small (`tickets` ~137 rows, `residents` ~800, `whatsapp_messages` ~500). The dominant problem is **too many round-trips on every navigation**, plus **pages remounting and re-fetching** instead of reusing in-memory shared data.

**Goal fit:** “Normal navigation should feel instant after initial load” fails today because:

1. Global providers re-fetch on **every pathname change**.
2. Middleware re-resolves tenant (2–3 DB queries) on **every protected request**.
3. There is **no React Query / SWR library** — only per-page `localStorage` paint-then-always-network.
4. Shared entities (`projects`, `workers`, tickets lists) are **re-loaded independently** on dashboard / tickets / summary / calendar / collections / etc.
5. Many routes have **no cache at all** → full loader on every visit.
6. `app/loading.tsx` shows a transition loader on soft navigations while the client page remounts.

---

## Biggest bottlenecks (ranked by impact)

| Rank | Bottleneck | Why it hurts | Expected impact if fixed |
|------|------------|--------------|--------------------------|
| **1** | Providers refetch on every route (`pathname` in `useCallback` deps) | Branding + entitlements + nav-config fire on **every** click even though providers stay mounted. Entitlements have **no** browser cache. | **Very high** — removes 3–8 redundant network hops per nav |
| **2** | No shared in-memory cache for projects/workers/tickets | Soft nav remounts page → `loading=true` → refetch same tables. localStorage only on a few pages and still does silent network. | **Very high** — makes warm nav feel instant |
| **3** | Middleware tenant + nav feature DB on every navigation | `getUser` + `organization_users` + `organizations` (+ `clients.enabled_nav_features`) before HTML | **High** — cuts TTFB / navigation latency |
| **4** | `/tasks` N+1 attachments (up to 41 HTTP requests) | 1 list API + up to 40 attachment GETs | **High** on that route |
| **5** | Dashboard 4× ticket count queries + secondary wave | 4 head counts + list + then logs/counts again | **Medium–high** on dashboard cold/silent refresh |
| **6** | `requireSessionClientId` / `getSingletonClientId` has **no** process cache | Comment claims cache; every `/api/*` redoes org chain | **Medium–high** for API-heavy pages |
| **7** | Missing indexes on `organization_users.user_id` and `organizations.client_id` | Hot path for middleware + RLS helper `bamakor_my_client_ids()` | **Medium** now; **high** as tenants grow |
| **8** | `ticket_logs` recent activity without org/client scope index | RLS `EXISTS` + order by `created_at` limit 5; no `created_at` / `organization_id` index | **Medium** (grows with log volume) |
| **9** | Routes with zero cache always show loaders | residents, tasks, calendar, attendance, collections, settings, WA inbox, … | **Medium** perceived latency |
| **10** | Summary KPI uses `fetchAllRows` of full ticket fields in range | Can pull large payloads / multi-page PostgREST | **Medium** on long date ranges |

---

## Shared tax on every authenticated navigation

These run **in addition to** page-specific queries.

### A. Middleware (`middleware.ts`)

| # | Request | Notes |
|---|---------|--------|
| 1 | `auth.getUser()` | Auth network |
| 2 | `organization_users.select('organization_id').eq('user_id')` | **Sequential** |
| 3 | `organizations.select('client_id').in(id, …)` | **Sequential after 2** |
| 4 | `clients.select('enabled_nav_features')` | On gated nav paths |

**Duplicate with client:** same org chain also runs in `resolveBinoClientIdForBrowser` / every `requireSessionClientId`.

**Index gap (advisor):** FK `organization_users.user_id` and `organizations.client_id` lack dedicated covering indexes (unique is on `(organization_id, user_id)` — lookups by `user_id` alone are suboptimal as data grows).

### B. Root providers (`AppProviders`)

| Provider | On every pathname change | Cache |
|----------|--------------------------|-------|
| `ClientBrandingProvider` | `resolveBinoClientId` + `clients.select('name, logo_url')` | localStorage 24h paint, **always refetch** |
| `PaidAddonsProvider` | `GET /api/addons/entitlements` | **None** |
| `SidebarNavProvider` | `resolveBinoClientId` + `GET /api/client/nav-config` | localStorage 5m paint, **always refetch** |

Root cause of provider refetch: `usePathname()` is in the `useCallback` dependency arrays for `loadBranding` / `load` / `loadNav`, so each route change recreates the callback and re-runs the effect.

### C. Shell extras

- `PageViewTracker` → `POST /api/analytics/page-view` (auth + DB write path)
- `app/loading.tsx` → `PageTransitionLoader` during soft nav

### Approximate shared cost per click

**~8–15 round-trips** before/during page data (middleware + branding + entitlements + nav-config + analytics + auth `getUser` multiples), even when navigating between already-visited screens.

---

## Caching / React Query status

| Mechanism | Present? |
|-----------|----------|
| `@tanstack/react-query` / SWR | **No** |
| Shared React context for tickets/projects/workers | **No** |
| Per-page localStorage “SWR” (paint + always network) | Yes: dashboard, tickets, projects, workers, summary meta/KPI |
| True skip-network on warm revisit | Almost never (cid session cache is the main exception) |

**Implication:** Soft navigation remounts `'use client'` pages → initial `loading === true` → spinner, even if the same data was fetched 2 seconds ago on another route.

---

## Auth / profile / buildings fetched repeatedly?

| Data | Fetched how often |
|------|-------------------|
| Auth user | Middleware every request; browser `getUser()` in `resolveBinoClientIdForBrowser` on nearly every resolve (even when cid cached) |
| Tenant `clientId` | Middleware every nav; browser cached 5m session / 24h local; server API **uncached** |
| Branding (name/logo) | Every pathname change |
| Nav features / order | Middleware + sidebar provider every pathname |
| Paid addons | Every pathname change (no LS cache) |
| Buildings (`projects`) | **Per page independently** — dashboard, tickets, summary, projects, residents, calendar, collections, campaigns, qr, … |
| Workers | Same pattern across many pages |
| Permissions | Via addons + `enabled_nav_features` — duplicated across middleware and client |

---

## Per-route inventory

Request counts below are **page-owned** DB/API calls on cold initial load. Add the **shared tax** above to each.

### `/dashboard`

| Metric | Value |
|--------|-------|
| DB requests (page) | ~11 (7 primary incl. 4 KPI counts + 4 secondary) |
| API | 0 |
| Slow / expensive | 4× `tickets` head counts; `ticket_logs` nested join without client filter / created_at index; secondary after primary (sequential wave) |
| Duplicates | Workers list + workers count; KPI counts overlap conceptually with open list; SWR always refetch |
| Parallelism | Primary `Promise.all` good; secondary waits for primary |
| Cache | localStorage 24h → silent refresh (no full loader on warm if cache hit) |
| Realtime | tickets → debounced silent reload |

**Root cause:** Heavy dashboard = many small PostgREST calls + shared tax.  
**Fix:** Single RPC/SQL for KPIs; filter/index `ticket_logs` by org; derive workers count from list; shared projects/workers query key.  
**Impact:** High on first paint + silent refresh cost.

---

### `/tickets`

| Metric | Value |
|--------|-------|
| DB | 3 parallel: tickets (limit 200 + projects join), workers, projects |
| Duplicates | Same projects/workers as dashboard; SWR always network |
| Cache | Yes (24h paint + silent) |
| Realtime | Yes |

**Root cause:** Remount refetch + no shared entity cache with dashboard.  
**Fix:** Shared `useProjects` / `useWorkers` / tickets query with `staleTime`.  
**Impact:** High for nav dashboard ↔ tickets.

---

### `/summary`

| Metric | Value |
|--------|-------|
| DB | projects + workers (meta) |
| API | `GET /api/summary/kpi` → 2 ticket counts + `fetchAllRows` of tickets in range (full summary columns) |
| Expensive | Unbounded range pagination of ticket rows for KPI view |
| Cache | Meta + KPI localStorage; history tab none |

**Fix:** Server-side aggregates for KPIs; don’t ship all ticket rows unless history needs them; share meta with other pages.  
**Impact:** Medium–high on wide date ranges.

---

### `/projects`

| DB | 2 parallel (workers, projects) |
| Cache | 24h SWR |
| Note | Detail drawer loads tickets on open (good lazy) |

---

### `/residents`

| DB / API | projects + **all residents** (no limit) + `/api/pending-residents` |
| Cache | **None** → always loader |
| Duplicate | `?tab=pending` can hit pending API twice (mount + tab effect) |
| Oversized | Full residents list payload |

**Fix:** Paginate/virtualize; cache list; dedupe pending fetch.  
**Impact:** Medium (grows with residents; already largest table ~800).

---

### `/workers`

| DB | 1 list (wide column set incl. `access_token`) |
| Cache | 24h SWR |
| Note | Selecting `access_token` into browser list is oversized/sensitive for list UI |

---

### `/tasks` ⚠️ worst N+1

| API | `GET /api/maintenance-tasks` then **up to 40** `GET .../attachments?task_id=` |
| Cache | None |
| Pattern | Classic N+1 |

**Fix:** Batch attachments in list API (`attachments` join or `task_id=in.(...)`).  
**Impact:** Very high on this route (41 HTTP + 41× `requireSessionClientId` org chains).

---

### `/site-tours`

| API | 1× `/api/site-tours` |
| Cache | None |

---

### `/calendar`

| Pattern | **Sequential:** await projects, then `Promise.all` events + google |
| Deps | Month/week change re-fetches **projects** again |
| Cache | None |

**Fix:** Parallelize projects with events; cache projects globally.  
**Impact:** Medium.

---

### `/attendance`

| API | `/api/attendance/dashboard` — **13 parallel** admin queries inside one route (events, tags×2, open shifts, anomalies, counts, shifts limit 2000, …) |
| Extra client | workers select + `clients.manager_phone` |
| Cache | None |

**Note:** Server-side parallelization is good; still heavy. Counts use `select('*', { count, head })` (harmless with `head: true`).

**Fix:** Materialized/summary stats; composite indexes on `(client_id, client_recorded_at)` / `(client_id, status)`; drop redundant client workers fetch if API returns names.  
**Impact:** Medium–high on addon users.

---

### `/professionals`

| DB | `select('*')` — **only main-route select \*** |
| RLS | Multiple permissive SELECT policies (advisor WARN) |
| Cache | None |

---

### `/settings`

| API | `/api/settings/read` + `/api/collections/webhook-url` |
| Cache | None |

---

### `/billing`

| API | summary + pricing in parallel |
| Inside summary | 5 count/list queries (tickets month, residents, workers, tickets 8w, buildings) + plan rows |
| Cache | None |

---

### `/addons`

| Page fetch | None (uses provider) |
| Still pays | Shared entitlements refetch every nav |

---

### `/collections`

| Pattern | Phase 1: projects + account-status → set clientId; Phase 2: charges + summary |
| Sequential phases | Yes (charges wait for clientId state) |
| API charges | `select('*')` page_size 100 |
| Cache | None |

**Fix:** Resolve cid first without blocking; narrower charge columns; cache projects.  
**Impact:** Medium.

---

### `/whatsapp-inbox`

| Mount | conversations list only (good) |
| On select | messages + session + context (+ realtime) |
| Cache | None |

---

### `/campaigns`

| Mount | projects select + WA broadcast templates API |
| Cache | None (sessionStorage only remembers last project id) |

---

### `/qr`

| DB | all projects (RLS, no explicit client_id filter) + clients phones |
| Cache | None |

---

## select('*') and oversized responses

| Location | Issue |
|----------|--------|
| `app/professionals/page.tsx` | `select('*')` on mount |
| Collections charge APIs | `select('*')` |
| Sales leads service | many `select('*')` (superadmin, not main nav) |
| Count queries with `select('*', { head: true })` | OK (no row body) |
| `/workers` list | Includes `access_token` — unnecessary for list |
| `/summary/kpi` | Full ticket rows via `fetchAllRows` for KPI screen |
| `/residents` | Unbounded resident rows |
| `/tickets` | limit 200 + nested projects — OK for now |
| Dashboard `ticket_logs` | Nested tickets → projects for 5 rows — OK size, weak index/RLS path |

---

## N+1 patterns

| Location | Severity |
|----------|----------|
| `/tasks` attachments ×40 | **Critical** |
| Dashboard KPI = 4 separate counts | Mild N (fixed 4, parallel) |
| Attendance dashboard = many queries | Intentional fan-out in one API (OK shape, heavy) |
| Calendar re-fetch projects per range | Avoidable duplicate |

---

## Sequential vs parallel

| Location | Issue |
|----------|--------|
| Middleware org chain | Must be sequential today; could be one SQL/RPC |
| Providers | Independent — currently fire in parallel but each is redundant every nav |
| Dashboard secondary | Waits for primary (acceptable) |
| Calendar | Projects awaited **before** events APIs — should parallelize |
| Collections | Two React effects phase clientId then charges — can collapse |
| `/tasks` | List then N attachments |

---

## Indexes, joins, RLS

### Advisors (Bamakor performance)

- **30 unindexed FKs** — highest priority for app hot path: `organization_users.user_id`, `organizations.client_id`, `maintenance_tasks.project_id`, `collection_charges.project_id`, `calendar_events.project_id`, `ticket_logs.organization_id`.
- **Multiple permissive policies** on `professionals` SELECT.
- Tickets/projects/workers generally well indexed for `(client_id, …)` list patterns.

### RLS overhead

Browser reads use policies like:

```sql
client_id IN (SELECT bamakor_my_client_ids())
```

`bamakor_my_client_ids()` joins `organization_users` → `organizations` per evaluation. Combined with missing `user_id` index, every PostgREST read pays org-resolution cost. `ticket_logs` is worse: policy is `EXISTS (tickets …)` with no direct client filter on the logs query.

Admin APIs bypass RLS (service role) but still pay org resolution in `requireSessionClientId`.

---

## Dashboard counts / stats

Dashboard does **not** scan full tickets for the open list (limit 50), but **does** issue **four separate exact counts** on tickets plus secondary counts on residents/workers/tasks. Billing and attendance similarly use multiple head counts. Prefer one aggregated query/RPC per screen.

---

## Recommended fix order (diagnose → small → larger)

Do **not** redesign UI. Suggested sequence:

### P0 — stop redundant work on every click (highest ROI)

1. **Remove `pathname` from provider load deps** (keep worker-portal short-circuit via separate effect). Load branding / entitlements / nav **once per session** (or on auth/visibility), not every route.
2. **Cache `/api/addons/entitlements`** in memory + short localStorage (like nav).
3. **Middleware:** short-lived cookie/JWT claim for `clientId` + `enabled_nav_features` to avoid 2–3 DB hits per navigation (invalidate on sign-out / settings change).
4. **Implement real process cache** for `getSingletonClientId` (comment already promises it).

### P1 — make warm navigation instant

5. Add **React Query** (or a thin shared store) for `projects`, `workers`, open `tickets`, entitlements, branding — `staleTime` 30–120s, `placeholderData` / keep previous.
6. Pages with localStorage: treat cache as enough to **never** set `loading=true` on remount; optional background refetch.
7. Soften `app/loading.tsx` impact (or route-group without global loading for client shell pages) so cached UI isn’t blocked by transition loader.

### P2 — route-specific firefights

8. **Batch task attachments** in one API.
9. Dashboard: **one RPC** for KPI counts; scope `ticket_logs` by `organization_id` + index `(organization_id, created_at DESC)`.
10. Calendar: parallelize projects + events; stop re-fetching projects on month change.
11. Residents: paginate; dedupe pending fetch.
12. Professionals: explicit columns; merge duplicate RLS policies.
13. Collections: narrower `select`; collapse load phases.

### P3 — DB hygiene (cheap, future-proof)

14. Indexes: `organization_users(user_id)`, `organizations(client_id)`, `ticket_logs(organization_id, created_at DESC)`, attendance `(client_id, client_recorded_at)`, etc.
15. Consider putting `client_id` on JWT `app_metadata` so RLS can use `auth.jwt()` without join (careful with claim freshness).

---

## Route summary table

| Route | Page DB/API reqs (cold) | Slow / expensive | Duplicates | Root cause | Recommended fix | Expected impact |
|-------|-------------------------|------------------|------------|------------|-----------------|-----------------|
| **(shared every nav)** | ~8–15 | Middleware org×2–3; entitlements; branding; nav-config | Org chain × middleware+API+RLS; clients read ×3 | pathname-triggered providers + uncached middleware | Cache session tenant; stop pathname refetch | **Very high** |
| `/dashboard` | ~11 | 4 KPI counts; ticket_logs RLS | workers list+count; projects/workers vs other pages | Fan-out + remount | RPC KPIs; shared queries; index logs | High |
| `/tickets` | 3 | limit 200 + join | projects/workers vs dashboard | Remount + no shared cache | React Query shared keys | High |
| `/summary` | 2 + 1 API | fetchAllRows tickets | projects/workers again | Heavy KPI payload | Aggregates API; share meta | Medium–high |
| `/projects` | 2 | — | workers again | Remount | Shared cache | Medium |
| `/residents` | 2 + 1 API | unbounded residents | pending API ×2 if tab=pending | No cache | Paginate; cache; dedupe | Medium |
| `/workers` | 1 | wide columns + access_token | — | Remount | Narrow select; shared cache | Low–medium |
| `/tasks` | 1 + ≤40 | **N+1 attachments** | auth×41 | N+1 | Batch attachments | **Very high (route)** |
| `/site-tours` | 1 API | — | — | No cache | Cache list | Low |
| `/calendar` | 1 + 2 API | sequential projects→APIs | projects every range change | Effect deps | Parallelize; cache projects | Medium |
| `/attendance` | 1 fat API + 2 client | 13 queries; shifts≤2000 | workers | Heavy dashboard API | Composite indexes; trim queries | Medium–high |
| `/professionals` | 1 | `select('*')`; dual RLS | — | Oversized + RLS | Columns + merge policies | Low–medium |
| `/settings` | 2 API | — | — | No cache | Cache read | Low |
| `/billing` | 2 API | multi counts | — | No cache | Cache summary | Low–medium |
| `/addons` | 0 (+shared) | shared entitlements | — | Provider refetch | P0 provider fix | High (via shared) |
| `/collections` | 1 + 3 API | charges `*`; phased load | projects | Phased effects | Parallelize; narrow select | Medium |
| `/whatsapp-inbox` | 1 API | — | — | No cache | Cache conversations | Low–medium |
| `/campaigns` | 1 + 1 API | — | projects | No cache | Shared projects | Low |
| `/qr` | 2 | — | projects/clients | No cache | Shared projects | Low |

---

## What “good” looks like (target)

After P0+P1 (without redesigning screens):

- First app load: still hits network for tenant + first page (acceptable).
- Navigate dashboard → tickets → projects → back: **no full-page loader**; paint from memory/`staleTime`; background revalidate only if stale.
- Shared providers and middleware: **≤1** tenant/entitlements refresh per several minutes, not per click.
- `/tasks`: **1** list request including attachments metadata.

---

## Out of scope / not done

- No production deploy.
- No large architectural PR in this pass (report only).
- Edge runtime latency histograms were unavailable from ClickHouse for the sampled query; conclusions are from code + schema + advisors + table sizes.
- Worker portal / superadmin / public pay flows not fully inventoried (same shared patterns likely apply where auth is used).
