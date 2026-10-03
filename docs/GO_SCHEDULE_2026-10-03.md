# Go schedule — buildings / collections / residual (2026-10-03)

Dates are calendar targets based on **remaining agent work** vs **external wait**. Not effort inflation.

## א. Go ניהול בניינים

| Track | Remaining | Wait |
|-------|-----------|------|
| Anon REVOKE apply (after owner OK) | ~0.5h agent verify | Owner review of `122_…_PROPOSAL.sql` |
| Backup list confirmation | — | Owner Dashboard/API ~10m |
| Deploy recommendations perf fix + re-measure | ~1h | Vercel deploy |
| Real cron → system_logs `db_connected` | — | Next cron **2026-10-04 06:00 UTC** **or** owner provides `CRON_SECRET` / Vercel team re-auth |
| Monitoring alert proof | ~0.5h once logs accessible | Vercel MCP team-scope re-auth |

**Earliest credible Go בניינים:** **2026-10-04** if owner completes backup screenshot + anon approve + Vercel re-auth (or CRON_SECRET) same day.  
**If waits slip:** Go slips with them — no “ready” on unit/build alone.

Already green for this track: Window A (111/112/system_logs/121), Next 16.3.8, WriteAccess live, sandbox smoke, local restore drill, rate limits, prod tip `edd27bb`.

## ב. Go גבייה

| Track | Remaining | Wait |
|-------|-----------|------|
| Apply 113 + concurrent idempotency proof | ~2–3h after approval | Owner Window B OK |
| Grow sandbox E2E + invoice path | ~3–5h | Grow sandbox keys / D2 (no real charges) |
| D3 treatment decision | — | Owner decision on 4 classified rows |
| False-success + webhook harden | already **נפרס** | E2E confirmation |

**Target:** start immediately after Go בניינים; calendar **2026-10-06–07** only if Grow access arrives by 2026-10-05. **Missing for a firm date:** Grow sandbox confirmation + 113 apply approval.

## ג. Residual + load validation

| Item | Remaining | Wait |
|------|-----------|------|
| Storage backup policy | design 0.5–1d | Owner decision |
| MFA superadmin | 3–5d work | Product decision |
| xlsx mitigation | 1–2d | Library choice |
| Isolated load test (not prod) | 2–4d | Staging/load env |
| Optional PITR purchase | — | Explicit paid approval only |

**Target window:** after Go גבייה; load env missing → cannot date load sign-off yet.
