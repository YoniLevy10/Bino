# Agent mandatory checklist — Bamakor test gate

**Status:** always-on for every Cursor / Cloud agent  
**Always-apply rule:** `.cursor/rules/agent-mandatory-ops-checklist.mdc`  
**Smoke command:** `npm run test:bamakor-smoke`

This document is the human-readable playbook. Agents must follow the Cursor rule even if they skip reading this file — but the rule points here for details.

---

## Why this exists

Owner requirement (2026-10): every agent, on every task, must:

1. **Profile** actions so they do not burn time (agent loops or production).
2. **Check internal logs** so they do not break the live system.
3. Avoid **irrelevant queries** that slow Bamakor / the app.
4. Treat **`https://bamakor.vercel.app` as the agent test environment** — Preview URLs alone are not enough; verify on top of CI.

---

## Bamakor as agent test environment

| Host | Role |
|------|------|
| `https://bamakor.vercel.app` | **Agent test gate** — live production deployment alias |
| `https://bino.casa` | Canonical product origin (users, SMS, SEO) |
| `*.vercel.app` Preview | Optional PR preview — **supplemental only** |

Behavior today (do not “fix” without owner approval):

- Browser paths on `bamakor.vercel.app` **308** → `bino.casa` (see `lib/canonical-host.ts`).
- `/api/webhook/*`, `/api/cron/*`, `/.well-known/*` **stay** on the Bamakor alias (Meta/Grow compatibility — `docs/DOMAIN.md`).

So the smoke proves: alias redirect still works, canonical login is up, webhook + cron routes still answer with expected auth gates (not 5xx).

**Not allowed on Bamakor / bino.casa:**

- Load tests (`scripts/load/*` refuses `bino.casa`; do not override onto Bamakor)
- Bulk writes / customer tenant mutation “for testing”
- Paid Supabase preview branches as a fake staging DB

---

## Checklist (copy into PR / agent summary)

### A — Profiling

- [ ] Scoped the investigation (single path / table / deploy / time window)
- [ ] No unbounded production scans or repeated heavy EXPLAIN/ANALYZE
- [ ] Changed hot paths reviewed for N+1 / missing filters / oversized payloads

### B — Logs

- [ ] Vercel `get_runtime_errors` (or equivalent) checked around the change window
- [ ] No new flood of: `CLIENTS_ACTIVE_QUERY_FAILED`, middleware tenant 503, webhook 5xx
- [ ] If regression found → fixed or reverted before “done”

### C — Queries

- [ ] Every live SQL/API call had a task-tied purpose
- [ ] Column-limited + `limit` / PK / `client_id` / short time range
- [ ] No cross-tenant dumps; no exploratory full-table reads

### D — CI + Bamakor smoke

- [ ] Lint / typecheck / unit (and relevant e2e) as applicable
- [ ] GitHub CI green (or failures fixed)
- [ ] `npm run test:bamakor-smoke` passed after deployable changes
- [ ] Preview URL (if any) listed only as extra evidence

---

## Smoke runner expectations

```bash
npm run test:bamakor-smoke
# optional override:
# BAMAKOR_SMOKE_BASE=https://bamakor.vercel.app npm run test:bamakor-smoke
```

| Check | Expect |
|-------|--------|
| `GET {bamakor}/login` (no follow) | **308** → `https://bino.casa/login` |
| `GET https://bino.casa/login` | **200** |
| `GET {bamakor}/api/webhook/whatsapp` | **not 5xx** (usually **403** without Meta signature) |
| `GET {bamakor}/api/cron/health-check` | **401** without `CRON_SECRET` |

Exit code `0` = gate passed. Print failures clearly; do not soft-pass.

---

## Auth / middleware extras

If the change touches `middleware.ts`, tenant resolution, `clients` RLS/GRANTs, or session→admin client swaps — also complete `.cursor/rules/auth-middleware-login-safety.mdc` (login → dashboard smoke). Bamakor HTTP smoke alone is not enough for that class.

---

## Hebrew (owner)

מעכשיו לכל סוכן: profiling שלא שורף זמן; בדיקת לוגים שלא נשבר הייצור; בלי שאילתות מיותרות; ובנוסף ל־CI — בדיקה מול `bamakor.vercel.app` כסביבת טסט לסוכנים, לא רק Preview.
