# BINO — App Quality + Grow Readiness Audit (2026-10-04)

**Scope:** Audit only. No product code changes in this deliverable.  
**Hard rule:** stability > elegance. No rewrite, no mass rename, no RLS/auth experiments.  
**Prod tip at audit:** `1a7a96c` / prior readiness tip `fd803d9`.  
**Stack kept:** Next.js App Router · React 19 · Supabase · PWA · Vercel.

---

## Executive snapshot

| Area | Verdict |
|------|---------|
| Navigation shell | **Already solid** — persistent manager layout, providers do **not** remount on pathname, RQ + localStorage SWR, hover prefetch |
| Biggest remaining UX drag | Cold `/api/settings/read`; secondary dashboard queries; missing React `error.tsx`; SW/PWA edge cases |
| React Query | **Already adopted** gradually — do **not** rewrite around it; extend where lists still bypass RQ |
| Grow ApproveTransaction | **VERIFIED** in DB + code (multiple ₪1 paid + `grow_approve_status=ok`) |
| Grow GetLink live launch | **PARTIAL** — code+webhook ready; no completed onboarding row beyond Bamakor `userId` paste |
| Mass Bamakor→BINO rename | **DO NOT TOUCH YET** |

---

# A. App Quality findings

Priority legend: **P0** user-facing break / stuck · **P1** clear slowness / trust · **P2** polish · **P3** nice-to-have.

Buckets: **SAFE NOW** · **NEEDS CARE** · **DO NOT TOUCH YET**

---

### A1. Providers do not remount on every route (good baseline)

| Field | Detail |
|-------|--------|
| Problem | — (non-issue; recorded so we do not “fix” it) |
| Evidence | `app/components/AppProviders.tsx` wraps root once; `app/(manager)/layout.tsx` keeps `AppShell` mounted; `ClientBrandingContext` comment + effect: load once, not on pathname |
| User impact | Returning to a visited screen should reuse RQ/local caches |
| Root cause | N/A |
| Proposed | Keep architecture; extend RQ coverage where pages still do ad-hoc `useEffect` fetches |
| Risk / Effort / Priority | — / — / — |
| Bucket | **DO NOT TOUCH YET** (working) |

---

### A2. Recommendations no longer block dashboard nav (closed)

| Field | Detail |
|-------|--------|
| Problem | Was: sync detector scan on GET `/api/recommendations` → ~5–8s |
| Evidence | `docs/PERF_AFTER_238_CONTENT_READY_2026-10-03.md`; `app/api/recommendations/route.ts` + `runAfterResponse` |
| User impact | Content-ready ~0.5–1.2s after fix (was ~10s networkidle feel) |
| Root cause | Fixed in #238/#239 |
| Proposed | None for scan path; optional forced-failure alert path still owner/Vercel logs |
| Risk / Effort / Priority | — / — / closed |
| Bucket | **DO NOT TOUCH YET** |

---

### A3. Dashboard still fires secondary Supabase reads after first paint

| Field | Detail |
|-------|--------|
| Problem | After RQ tickets/projects paint, dashboard still loads `ticket_logs` (join), residents count, open maintenance_tasks count, and lazy `professionals` |
| Evidence | `app/(manager)/dashboard/page.tsx` `loadSecondaryData` + `loadProfessionals` (~L282–340) |
| User impact | First dashboard visit can still “settle” after shell appears; warm return is better via cache/`hasPaintedDataRef` |
| Root cause | KPI/activity designed as optional enrichment, not gated behind single RPC |
| Proposed | **Minimal:** one RPC/aggregated endpoint for activity+counts **or** defer secondary until idle (`requestIdleCallback` / after first interaction). Do not block first paint further. |
| Risk | Medium if new RPC wrong tenant filter | Effort | M | Priority | **P1** |
| Bucket | **NEEDS CARE** |

---

### A4. Tickets + Dashboard share RQ open-tickets key (good) — professionals still duplicated

| Field | Detail |
|-------|--------|
| Problem | Both dashboard and tickets pages independently `supabase.from('professionals')` with local refs |
| Evidence | `dashboard/page.tsx` `loadProfessionals`; `tickets/page.tsx` similar select; RQ key `professionals` exists in `lib/query-keys.ts` + `use-professionals-list.ts` but pages may not fully use it |
| User impact | Extra round-trip when navigating dashboard↔tickets on cold professionals |
| Root cause | Partial RQ migration |
| Proposed | Route professionals through existing `useProfessionalsList` / prefetch in `route-prefetch.ts` (already prefetches tickets/workers/projects/residents) |
| Risk | Low | Effort | S | Priority | **P2** |
| Bucket | **SAFE NOW** |

---

### A5. Settings cold path still heavy

| Field | Detail |
|-------|--------|
| Problem | `/settings` historically ~4.8–5.8s cold wall; dominated by `/api/settings/read` |
| Evidence | `docs/PERF_POST_LOGIN_2026-10-03.md`; `app/(manager)/settings/page.tsx` fetches `/api/settings/read` then optionally grow-onboard/webhook-url |
| User impact | Settings feels like a full reload vs tickets/workers |
| Root cause | Likely function cold start + wide select; not proven as missing index without EXPLAIN |
| Proposed | Keep endpoint; add RQ key `queryKeys.settings` with staleTime + paint-from-cache; measure before narrowing SELECT |
| Risk | Low for cache; Medium if SELECT/GRANT change | Effort | S–M | Priority | **P1** |
| Bucket | **SAFE NOW** (client cache) / **NEEDS CARE** (server SELECT trim) |

---

### A6. Collections board: 2–3 parallel APIs on mount (acceptable)

| Field | Detail |
|-------|--------|
| Problem | Mount: `account-status` + `charges` + `summary` |
| Evidence | `CollectionsBoard.tsx` ~L178–227 `Promise`-style parallel fetches |
| User impact | Acceptable for money UI; not 8–15 query theatre |
| Root cause | Intentional separation (authz / list / KPIs) |
| Proposed | Only coalesce if profiling shows serial waterfall (code already parallelizes charges+summary) |
| Risk / Effort / Priority | Low / — / **P3** |
| Bucket | **DO NOT TOUCH YET** until measured worse |

---

### A7. Per-screen request sketch (mount / first useful paint)

Estimates from code paths (not live HAR this pass). Auth shell shared: branding/addons/nav-config (cached), page-view beacon.

| Screen | Typical data calls | Notes |
|--------|--------------------|-------|
| Dashboard | RQ open tickets + projects/workers (+ KPI RPC if used) + secondary logs/counts + optional recommendations + professionals | Secondary is the remaining cost |
| Tickets | Shared RQ open tickets + professionals + closed/history fetches on demand | VirtualizedList on mobile lists |
| Ticket detail | Drawer: ticket row + attachments + midrag/recommendations optional | Lazy |
| Residents | RQ paginated `use-residents-list` | Prefetch on hover |
| Projects / Workers | RQ list hooks + prefetch | Good pattern |
| Collections | account-status, charges, summary | Parallel |
| Settings | settings/read (+ grow endpoints when addon) | Cold P1 |
| Superadmin | Separate layout/manifest; session/MFA gate | Out of manager RQ |

**Not seeing** systematic 8–15 sequential queries for core manager screens after RQ wave — except settings cold + dashboard secondary enrichment.

---

### A8. No App Router `error.tsx` / ErrorBoundary

| Field | Detail |
|-------|--------|
| Problem | No `app/error.tsx`, `app/global-error.tsx`, or manager `error.tsx` found |
| Evidence | Glob zero matches; grep no ErrorBoundary |
| User impact | Uncaught render error → blank / stuck white screen |
| Root cause | Never added |
| Proposed | Minimal `error.tsx` + `global-error.tsx` with Hebrew retry + link to `/dashboard` — no Sentry required to ship boundary |
| Risk | Low | Effort | S | Priority | **P0** |
| Bucket | **SAFE NOW** |

---

### A9. Fetch reliability helpers exist; stuck-state coverage uneven

| Field | Detail |
|-------|--------|
| Problem | Timeouts exist (`fetch-with-timeout`, `fetch-timeout`) but pages differ on empty/error UI vs infinite spinner |
| Evidence | `lib/fetch-with-timeout.ts`; dashboard `hasPaintedDataRef` keeps UI on silent refresh failure (good pattern to copy) |
| User impact | Some screens can feel “thinking” forever on one failed request |
| Root cause | Inconsistent page patterns |
| Proposed | Standardize: if cache exists → keep showing; else error card + Retry. Start with settings + collections only |
| Risk | Low | Effort | S–M | Priority | **P1** |
| Bucket | **SAFE NOW** |

---

### A10. PWA / mobile — baseline good; SW still a risk surface

| Field | Detail |
|-------|--------|
| Problem | Custom `/sw.js` caches HTML/static; past audits flagged possible post-login stall on device |
| Evidence | `public/sw.js` (v10), manifests, safe-area in `AppShell` / `MobileMenu`, `PullToRefresh`, `MobileBottomNav`, splash once/session (`lib/app-splash-session.ts`) |
| User impact | Usually app-like; occasional stale shell / update banner friction |
| Root cause | Aggressive HTML cache + activate without skipWaiting until banner |
| Proposed | **Device smoke only first** (iPhone standalone). Code change only if stall reproduced: narrow HTML caching for `/dashboard` etc. |
| Risk | Medium (SW changes break offline/push) | Effort | M | Priority | **P1** (verify) / **P2** (change) |
| Bucket | **NEEDS CARE** |

---

### A11. Large lists — partial virtualization

| Field | Detail |
|-------|--------|
| Problem | Tickets/residents mobile use `VirtualizedList`; desktop tables may still mount large DOM |
| Evidence | `app/components/VirtualizedList.tsx`; tickets ~L1488; residents comment “virtualized for long lists” |
| User impact | Fine for typical tenant sizes; risk grows with thousands of rows |
| Root cause | Desktop table not virtualized |
| Proposed | Do nothing until a tenant hits jank; then virtualize desktop table or hard-cap page size |
| Risk / Effort / Priority | — / — / **P3** |
| Bucket | **DO NOT TOUCH YET** |

---

### A12. DB indexes — already present for hot paths; no new indexes without EXPLAIN

| Field | Detail |
|-------|--------|
| Problem | Temptation to add more indexes “just in case” |
| Evidence | Migrations `007`, `027`, `033`, `106`, `120` already cover tickets/residents/charges hot filters |
| User impact | Extra indexes cost write amp; wrong ones do nothing |
| Proposed | Only after `EXPLAIN (ANALYZE)` on a slow query from logs |
| Risk | Medium | Effort | — | Priority | — |
| Bucket | **DO NOT TOUCH YET** |

---

### A13. Do not introduce a second caching library / architecture rewrite

| Field | Detail |
|-------|--------|
| Problem | “Add React Query everywhere” as rewrite |
| Evidence | `@tanstack/react-query` already in `package.json`; `AppQueryProvider` defaults: staleTime 60s, no refetchOnWindowFocus, retry 1 |
| Proposed | Continue **gradual** adoption for remaining ad-hoc fetches only |
| Bucket | **DO NOT TOUCH YET** (rewrite) / **SAFE NOW** (wire one more hook) |

---

## A — Prioritized action queue (after you approve)

| Order | Item | Bucket | Why first |
|-------|------|--------|-----------|
| 1 | Add `error.tsx` / `global-error.tsx` | SAFE NOW | Stops white-screen class of failures |
| 2 | Professionals → existing RQ hook + prefetch | SAFE NOW | Removes duplicate fetch; tiny |
| 3 | Settings RQ + keep cached paint | SAFE NOW | Highest remaining cold-nav pain |
| 4 | Copy `hasPaintedDataRef` error pattern to settings/collections | SAFE NOW | Perceived reliability |
| 5 | Dashboard secondary → idle/RPC | NEEDS CARE | Needs careful tenant scoping |
| 6 | SW HTML cache narrowing | NEEDS CARE | Only after iPhone reproduce |
| 7 | New DB indexes / SELECT GRANT / RLS | DO NOT TOUCH YET | Outage class |

---

# B. Grow readiness matrix

Status values: **VERIFIED** · **PARTIAL** · **MISSING** · **UNKNOWN**  
(VERIFIED only with code and/or DB evidence.)

| Requirement | Current Status | Evidence | Missing | Action |
|-------------|----------------|----------|---------|--------|
| ApproveTransaction | **VERIFIED** | Webhook calls `approveGrowTransaction` **before** mark paid (`app/api/webhook/grow/route.ts` L128–168); sum-check first; failure → 502 + ops alert + **not** paid. DB: charge `99ba763c…` tx **`552938`** approve ok; also **`553499`**, **`553493`**, **`553695`** (₪1 paid, `grow_approve_status=ok`) | — | Send Grow sample **`552938`** or newest **`553695`** |
| transactionId storage | **VERIFIED** | `persistGrowTransactionIds` / `recordGrowApproveResult` → `grow_transaction_id`, token, `grow_approve_status`, `grow_approve_at` | — | Keep; use retry route if approve failed |
| Double-approve / retry | **PARTIAL** | Approve before paid; retry API `app/api/collections/charges/retry-approve/route.ts`; webhook idempotent paid path notes in `collection-charge-ops` | Documented race under concurrent webhooks not load-tested in this audit | Manual retry exists; no change needed for go-live packet |
| Payment status vs Grow | **VERIFIED** (happy path) | Real Bit/card ₪1 → `status=paid` + approve ok (`COLLECTIONS_GO_LIVE` B5b/c + DB) | Invoice E2E still separate | Do not claim invoice chain VERIFIED |
| Terms page | **VERIFIED** | `https://bino.casa/terms` from `TERMS_OF_SERVICE.md` — age 18+, cancel, privacy, digital delivery | Lawyer review optional | Send URL to Grow Site_check |
| Terms checkbox | **VERIFIED** | `/pay/[token]`: `acceptedTerms` required; button `disabled={!acceptedTerms}`; error if unchecked | Consent **not** persisted server-side | Optional later: store `terms_accepted_at` — **not** required if Site_check only needs UI |
| Payment site URL | **VERIFIED** | `https://bino.casa`; pay links `/pay/{token}`; merchant page `/vaad-pay/{clientId}`; contact `/contact` | — | Send URLs from `GROW_PRE_LIVE_CHECKLIST` §2 |
| Payment video | **UNKNOWN→PARTIAL** | Owner states video exists; repo docs still mark ⛔ (`GROW_PRE_LIVE_CHECKLIST` §3) | Agent cannot verify file/path in repo | Confirm file matches **current** `/pay`→Grow→webhook→paid flow; then mark VERIFIED in checklist |
| Merchant onboarding (GetLink) | **PARTIAL** | Code: `lib/grow-register.ts`, `POST /api/collections/grow-onboard`, Settings Grow UI, webhook `/api/webhook/grow-register` | Live launch to ID-verification not evidenced in DB | Owner: run GetLink on client **without** userId until ID step; send webhook URL + email to Grow |
| ID verification step | **MISSING** (live proof) | Only Bamakor has `grow_user_id`; `grow_onboarding_status` **null**, started/completed **null** → looks like pasted userId, not GetLink completion | Live GetLink session | Execute Grow’s requested stop-at-ID flow |
| Onboarding callback webhook | **PARTIAL** | Route live (GET `{ok,route:grow-register}`); auth via `GROW_WEBHOOK_SECRET` `?token=`; binds `tracking_code`→`grow_encrypted_lead`; sets `approved`/`rejected`/`pending`; userId conflict guard | Grow marketer webhook config + successful callback not proven | Configure at Grow; fire test callback |
| Webhook security | **VERIFIED** (shared secret) | `authorizeGrowWebhook` on pay + register routes; 401 without token | No HMAC beyond shared secret (Grow docs constraint noted in code) | Keep secret rotation process |
| Idempotency (register webhook) | **PARTIAL** | Re-POST with same tracking updates same client; conflict if userId used elsewhere | No durable event-id table for register | Acceptable for v1; don’t rewrite |
| System name BINO | **VERIFIED** (marketing) | UI/pay brand “Bino”/BINO; terms title BINO | Internal Bamakor IDs remain | **Do not mass-rename** internals |

### Recommended sample IDs to send Grow

| Field | Value |
|-------|--------|
| transactionId (oldest documented Bit ₪1) | `552938` |
| transactionId (newer ₪1, 2026-10-02) | `553695` |
| Charge UUID (552938) | `99ba763c-c321-4569-904e-d621dad82245` |

### Bamakor vs BINO naming map (no rename)

| Kind | Examples | Action |
|------|----------|--------|
| Marketing / UI | BINO, Bino on `/pay`, terms | Keep |
| Internal OK | `BAMAKOR_CLIENT_ID`, client name “Bamakor”, `bamakor_branding_v1_*` cache keys, `lib/bamakor-client.ts` | **Leave** |
| Grow/config | Merchant business titles, sandbox labels | Leave unless Grow asks |

---

## Grow — what blocks the “answer Grow with confidence” checklist

| # | Item | Status for reply |
|---|------|------------------|
| 1 | ApproveTransaction | ✅ can answer |
| 2 | Example transactionId | ✅ `552938` / `553695` |
| 3 | Terms + checkbox | ✅ |
| 4 | Site URL | ✅ `https://bino.casa` |
| 5 | Video | ⚠️ owner confirm file + flow match |
| 6 | GetLink to ID verification | ❌ still need live run |
| 7 | Onboarding webhook/email | ⚠️ code ready; need Grow config + live proof |
| 8 | Name BINO | ✅ |

---

## Explicit non-goals (this audit)

- React Native / Capacitor / native rewrite  
- Replacing Next/Supabase/Vercel  
- Mass Bamakor rename  
- Destructive migrations / RLS experiments  
- Adding indexes without EXPLAIN  
- Full TanStack Query rewrite of every page  

---

## Next step (awaiting your OK)

1. You confirm which **SAFE NOW** items (error boundaries, professionals RQ, settings cache) to implement **one PR at a time**.  
2. You run **GetLink → ID verification** + confirm **video** for Grow packet.  
3. No production code from this audit until you pick items from the queue.
