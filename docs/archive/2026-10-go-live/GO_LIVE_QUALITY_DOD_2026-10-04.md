# Go-Live Quality Wave — Definition of Done (2026-10-04)

**Branch:** `cursor/go-live-quality-wave-a926` · PR #247  
**Rule:** no rewrite · no speculative RLS · no Bamakor mass rename · small commits · evidence or ACCEPTED/EXTERNAL only.

Statuses allowed: **VERIFIED FIXED** · **VERIFIED NOT A PROBLEM** · **ACCEPTED NON-BLOCKER** · **EXTERNAL BLOCKER — GROW** · **EXTERNAL BLOCKER — OWNER**

---

## APP QUALITY

| Area | Before | After | Evidence | Status |
|------|--------|-------|----------|--------|
| Error boundaries | Missing → white screen risk | `app/error.tsx`, `global-error.tsx`, `(manager)/error.tsx` + Hebrew Retry/Dashboard | Unit: `tests/route-error-fallback.test.ts`; force page `/dev-force-error` when `NEXT_PUBLIC_ALLOW_FORCE_ERROR=1` | **VERIFIED FIXED** (unit + code). Owner device smoke of force page = optional |
| Professionals duplicate fetch | Separate `supabase.from` on Dashboard + Tickets | Shared RQ `professionalsActiveAssign` + hover prefetch | `useActiveProfessionalsForAssign`, `tests/professionals-active-assign-key.test.ts` | **VERIFIED FIXED** |
| Settings cold / warm | Full refetch every visit; ~4.8s cold historically | RQ cache 60s + keep form on refresh fail + retry banner | `use-settings-read.ts`, settings page; DB EXPLAIN **0.7ms** | **VERIFIED FIXED** (cache). Cold start remainder = **ACCEPTED NON-BLOCKER** (Vercel/auth, not DB) |
| Settings DB indexes | Suspected | EXPLAIN shows sub-ms; no index added | `SETTINGS_READ_LATENCY_EVIDENCE_2026-10-04.md` | **VERIFIED NOT A PROBLEM** |
| Dashboard secondary delay | Secondary queries in critical path | Deferred via `requestIdleCallback` after first paint | `dashboard/page.tsx` | **VERIFIED FIXED** (defer). RPC not needed |
| Tickets open query plan | Seq scan on small table (~146 rows), **7ms** | No new index (planner correct at current size) | EXPLAIN ANALYZE Bamakor open tickets | **VERIFIED NOT A PROBLEM** at current scale; re-EXPLAIN when 10k+ tickets |
| Lists scale | Residents page size 100; tickets 200 + virtualized mobile; workers/projects RQ | Hard caps already present | hooks + pages | **VERIFIED NOT A PROBLEM** for launch; desktop virtualization **ACCEPTED NON-BLOCKER** until tenant hits thousands |
| Projects empty error | Could spinner forever | ErrorState + retry when RQ fails and no cache | `projects/page.tsx` | **VERIFIED FIXED** |
| Collections / Workers / Residents errors | Already ErrorState patterns | Unchanged (already compliant) | CollectionsBoard L694; workers L787; residents ErrorState | **VERIFIED NOT A PROBLEM** |
| PWA / Service Worker stall | Audit risk | No iPhone standalone in agent env; SW uses update banner + no auto skipWaiting | `public/sw.js` v10 | **EXTERNAL BLOCKER — OWNER** (10-min iPhone checklist). No SW code change without reproduction → policy met |
| Infinite spinner critical paths | Mixed | Settings/Projects fixed; others already timeout via `fetchWithTimeout` | fetch helpers default timeouts | **VERIFIED FIXED** / **VERIFIED NOT A PROBLEM** by screen |

---

## GROW

| Requirement | Evidence | Status |
|-------------|----------|--------|
| ApproveTransaction | Code path approve-before-paid; DB `552938`/`553695` `grow_approve_status=ok`; vitest `grow-webhook.post.test.ts` | **VERIFIED FIXED** (already) — no rewrite |
| transactionId sample | `552938`, `553695`; charge `99ba763c-…` | **VERIFIED NOT A PROBLEM** |
| Terms page | Live `https://bino.casa/terms` | **VERIFIED NOT A PROBLEM** |
| Terms checkbox | `/pay/[token]` disabled until accept | **VERIFIED NOT A PROBLEM** |
| Payment site URL | `https://bino.casa` | **VERIFIED NOT A PROBLEM** |
| Payment video | Owner asserts exists; not in repo | **EXTERNAL BLOCKER — OWNER** confirm file matches current `/pay` flow |
| Register webhook live GET | `GET /api/webhook/grow-register` → `{"ok":true,"route":"grow-register"}` | **VERIFIED FIXED** |
| Register webhook auth | POST without token → **401** on production | **VERIFIED FIXED** |
| Register webhook logic | Unit: approve / conflict / unknown lead | `tests/grow-register-webhook.route.test.ts` | **VERIFIED FIXED** (code). Live GetLink→callback still |
| GetLink → ID verification | Sandbox + סביון have **no** `grow_user_id` (ready targets); agent lacks Grow UI session + register keys in env | **EXTERNAL BLOCKER — OWNER/GROW** — run GetLink from Settings→Grow on Sandbox until ID step; paste webhook URL to Grow |
| Invoice E2E | Code `grow-invoice` route live GET ok; **zero** DB rows with `grow_invoice_*` | **EXTERNAL BLOCKER — GROW** — need Grow document settings + payment that emits invoice notify. Our handler VERIFIED in code |
| Double payment / idempotent paid webhook | Existing harden + tests | **VERIFIED NOT A PROBLEM** for known path |

### Webhook URL to send Grow (owner — includes secret)

1. Open Settings → Grow (as tenant) **or** `GET /api/collections/grow-onboard` when authenticated — field `register_webhook_url`.  
2. Shape: `https://bino.casa/api/webhook/grow-register?token=<GROW_WEBHOOK_SECRET>`  
3. **Do not paste the token in chat.**

### Expected Grow register payload fields (parsed)

From `extractGrowRegisterWebhook`: `tracking_code`, `user_id`, `business_title`, `phone`, `package_name`, `tracking_status.id` / `.message` (id `3`=approved, `4`=rejected). Binding key: `tracking_code` ↔ `clients.grow_encrypted_lead`.

---

## CUSTOMER READINESS

| Item | Status | Notes |
|------|--------|-------|
| New client onboarding | **EXTERNAL BLOCKER — OWNER** | Soft-launch checklist exists; GetLink live still owner |
| Manager login | **VERIFIED NOT A PROBLEM** | Prior smoke + cron health |
| Buildings / Projects | **VERIFIED NOT A PROBLEM** | ErrorState added |
| Residents | **VERIFIED NOT A PROBLEM** | Paginated 100 |
| Tickets | **VERIFIED NOT A PROBLEM** | Cap 200 + RQ share |
| Workers | **VERIFIED NOT A PROBLEM** | ErrorState present |
| Payments / Grow charge path | **VERIFIED NOT A PROBLEM** for approve; invoice **EXTERNAL BLOCKER — GROW** |
| Grow merchant GetLink | **EXTERNAL BLOCKER — OWNER/GROW** | |
| Permissions / viewer | **VERIFIED NOT A PROBLEM** | Prior PERMISSIONS_LIVE |
| Mobile/PWA | **EXTERNAL BLOCKER — OWNER** iPhone smoke | |
| Error handling | **VERIFIED FIXED** | Boundaries |
| Performance nav | **VERIFIED FIXED** | RQ + defer secondary |
| Tenant isolation | **VERIFIED NOT A PROBLEM** at code level; re-smoke after merge | Prior cross-org 404 evidence |

---

## Owner checklist before first cold-call tomorrow

1. **iPhone PWA** 10 min (install → login → nav → background → reopen → update banner). If clean → mark PWA **VERIFIED NOT A PROBLEM**.  
2. **GetLink** on Sandbox client (no userId) → stop at ID verification → send Grow webhook URL + email.  
3. Confirm **payment video** matches current `/pay` checkbox flow.  
4. Ask Grow for **invoice notify** test if invoices required day-1.  
5. Set `SUPERADMIN_EMAILS` + MFA enroll (from prior owner list).  
6. Optional: `NEXT_PUBLIC_ALLOW_FORCE_ERROR=1` on preview only → open `/dev-force-error` → see Retry UI → unset env.

---

## What we will NOT do without new evidence

- Mass Bamakor rename  
- New ticket indexes at current ~150-row scale  
- SW rewrite without iPhone reproduction  
- RPC for dashboard secondary (defer already applied)  
- RLS experiments for perf
