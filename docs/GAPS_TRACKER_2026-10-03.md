# Gaps tracker — paying customers readiness (unified)

**Updated:** 2026-10-03 ~20:15–20:25 UTC (execution mode)  
**Prod tip:** `cbea05e` (#239 after hardening) pending READY after `26b93de` (#238)  
**Parallel PRs:** #240 load · #241 storage · #242 122/113 evidence · #243 MFA · #244 xlsx

Status: **פתוח** / **תוקן בקוד** / **נפרס** / **אומת** / **חסום**

| ID | Topic | Status | Evidence | Blocker | Next |
|----|-------|--------|----------|---------|------|
| B1/H1 | 111 WA+REVOKE auth | **אומת** | Window A | — | — |
| H8 | 112 soft-delete | **אומת** | Window A | — | — |
| H4 | system_logs | **אומת** table / cron row **חסום** | table+probes | Vercel scope / next 06:00 UTC cron | Owner: Vercel re-auth team `team_WWxoCoCEGaEAK0e2JknuqGxq` |
| B2 | 113 idempotency | **אומת** schema+UNIQUE+4-way API | WINDOW_B_113 + charge `6077ad97…` | Grow E2E | Grow sandbox for payment/invoice |
| 122 | anon REVOKE | **אומת** | MIGRATION_122 + PostgREST deny + create-ticket 200 | git evidence PR #242 | Merge #242 when CI green |
| H7 | Next 16.3.8 | **נפרס** | #231 | — | — |
| H2/H3 | Grow harden | **נפרס** | #235 | Grow E2E | Sandbox keys |
| M11 | Report rate limit | **נפרס** | #236 | — | Optional HMAC |
| P1 WriteAccess | Viewer API | **אומת** | PERMISSIONS_LIVE | — | — |
| Cross-org | Isolation | **אומת** | 404 Bamakor ids | — | — |
| Perf recommendations | Non-blocking + after() | **נפרס** (#238+#239) / content-ready **אומת** | PERF_AFTER_238 | — | Re-measure after #239 READY |
| Detectors monitoring | after()+system_logs | **נפרס** code | #239 | Forced failure alert needs Resend/Vercel logs | Owner Vercel re-auth |
| Backup/PITR list | Real backups | **חסום** | BACKUP_TRUTH 401 API | Dashboard/token | Owner screenshot Backups |
| Restore drill | Dump≠backup | **חלקי** local dump **אומת**; listed backup restore **חסום** | RESTORE_DRILL | Backup list | Owner confirm backups then optional new-project restore |
| Storage DR | Policy | **תוקן בקוד** | #241 | Merge + owner S3 versioning | Merge #241 |
| MFA superadmin | Identity+AAL2 | **תוקן בקוד** | #243 | CI + enroll | Merge; set SUPERADMIN_EMAILS; enroll TOTP |
| xlsx | exceljs | **תוקן בקוד** | #244 | CI | Merge when green |
| Load harness | Isolated | **תוקן בקוד** | #240 | Run locally not prod | Merge; run on localhost |
| Monitoring+alert | Runtime | **חסום** | MONITORING_PROOF | Vercel MCP 403 | Exact re-auth below |
| D3 charges | Classification | **אומת** docs | COLLECTION_CHARGE_ANOMALY | No Approve | Keep docs only |
| Grow invoice E2E | — | **חסום** | — | Grow sandbox | Owner Grow access |

## Owner actions only (do not paste secrets in chat)

1. **Vercel MCP:** Disconnect → reconnect OAuth selecting team `team_WWxoCoCEGaEAK0e2JknuqGxq` (project `bino`). Needed for runtime logs + alert proof.  
2. **Supabase Backups:** open Bamakor → Database → Backups; confirm daily list / PITR window (read-only).  
3. **MFA enroll:** after #243 merge, set `SUPERADMIN_EMAILS`, enable Auth MFA, enroll TOTP.  
4. **Grow sandbox:** confirm keys/env for E2E (no real charges).

## Go draft (not final until PRs merged + owner items)

| Track | Draft | Why |
|-------|-------|-----|
| בניינים | **Conditional Go** after #242–#244 merge + backup screenshot + cron/monitoring path | Core security/perf/smoke done; monitoring/backup list still owner-gated |
| גבייה | **No-Go** until Grow E2E | 113 אומת; payment chain not live-proven |
| עומס | **No-Go** | Harness exists (#240); no isolated run results yet |
