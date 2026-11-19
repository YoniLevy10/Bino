# Go schedule — buildings / collections / load (2026-10-03, post-closure)

Supersedes earlier draft dates after Window A/B, mig 122, #238–#244 on prod (`fd803d9`).

## א. ניהול בניינים — Conditional Go **now**

Agent work for this track is done. Calendar slip only for **owner**:

| Owner item | Blocks absolute Go? |
|------------|---------------------|
| Backups UI screenshot | Yes for “backup proven”; Conditional Go OK if knowingly accepted |
| Vercel team re-auth / cron `db_connected` | Yes for monitoring proven; Conditional Go OK if knowingly accepted |
| Superadmin MFA enroll + `SUPERADMIN_EMAILS` | **Yes** — must complete before relying on superadmin after secret removal |

## ב. גבייה — No-Go until Grow E2E

| Remaining | Dependency |
|-----------|------------|
| Grow sandbox charge → webhook → invoice | Owner Grow sandbox keys |
| D3 treatment decision | Owner |

113 schema + concurrent idempotency already **אומת**. No second migration gate.

## ג. עומס יעד — No-Go until measured local run

Harness **אומת** (guard + mock). Need healthy local Next + local Supabase, then `npm run load:isolated`. Never `bino.casa`.
