# Gaps tracker — paying customers readiness (unified)

**Updated:** 2026-10-03 ~20:25 UTC (closure)  
**Prod tip:** `fd803d9` (#244 exceljs) · prior `d5f191b` (#243 MFA) · Production READY  
**Merged this session:** #231–#236 · #238–#244 · Window A/B DDL · mig 122

Status: **פתוח** / **תוקן בקוד** / **נפרס** / **אומת** / **חסום**

| ID | Topic | Status | Evidence | Residual |
|----|-------|--------|----------|----------|
| B1/H1 | 111 WA unique + REVOKE auth writes | **אומת** | WINDOW_A | — |
| H8 | 112 projects.deleted_at | **אומת** | WINDOW_A | — |
| H4 | system_logs table | **אומת** table / cron row **חסום** | table exists; no live `db_connected` from cron | Owner: Vercel team re-auth or `CRON_SECRET` / wait 06:00 UTC |
| B2 | 113 idempotency_key + UNIQUE | **אומת** | WINDOW_B_113 · 4-way API → charge `6077ad97…` | Grow payment E2E still open |
| 122 | anon REVOKE core writes | **אומת** | MIGRATION_122 · PostgREST deny · create-ticket 200 | — |
| H7 | Next ≥16.2.5 (16.3.8) | **נפרס** | #231 | — |
| H2/H3/M2/M3 | Grow webhook harden | **נפרס** | #235 | Grow sandbox E2E |
| M11 | Public report rate limit | **נפרס** | #236 | Optional HMAC |
| P1 | Viewer WriteAccess API gaps | **אומת** | PERMISSIONS_LIVE | — |
| Cross-org | Service-role isolation | **אומת** | 404 on Bamakor ids from sandbox | — |
| Perf | Recommendations non-blocking | **אומת** content-ready | #238+#239 · PERF_AFTER_238 | PWA SW device check residual |
| Detectors after() | Failure → system_logs (+ops) | **נפרס** | #239 · RECOMMENDATIONS_AFTER | Forced-failure alert needs Resend/Vercel logs |
| Backup/PITR list | Real backup objects | **חסום** | BACKUP_TRUTH · API 401 | Owner: Dashboard Backups screenshot |
| Restore drill | Logical dump ≠ platform backup | **חלקי** | RESTORE_DRILL local subset **אומת** | Listed-backup restore to new project optional |
| Storage DR | Policy + purge gate | **נפרס** | #241 · STORAGE_BACKUP_POLICY | Owner: S3/versioning decision if desired |
| MFA superadmin | Identity + AAL2; secret gone | **נפרס** | #243 on prod `d5f191b`/`fd803d9` | Owner: set `SUPERADMIN_EMAILS` + enroll TOTP |
| xlsx | exceljs replace | **נפרס** | #244 · XLSX_MITIGATION | Smoke import/export once in UI |
| Load harness | Isolated autocannon/k6 | **אומת** guard + mock run | #240 · LOAD_TEST + mock summary below | Real Next+local Supabase capacity not measured |
| Monitoring+alert | Runtime logs path | **חסום** | MONITORING_PROOF · Vercel MCP 403 | Owner: re-auth team `team_WWxoCoCEGaEAK0e2JknuqGxq` |
| D3 charges | 4 paid w/o approve | **אומת** classification | COLLECTION_CHARGE_ANOMALY | No status change; owner treatment decision |
| Grow invoice E2E | Charge → pay → invoice | **חסום** | — | Owner Grow sandbox keys |

## Owner actions (exact — no secrets in chat)

1. **Vercel MCP:** Disconnect → Reconnect OAuth → select team `team_WWxoCoCEGaEAK0e2JknuqGxq` (project **bino**), not only personal `yonilevy10s-projects`. Unblocks runtime logs + alert proof.  
2. **Supabase Backups:** open Bamakor → Database → Backups; note daily list and whether PITR is on (read-only).  
3. **Superadmin MFA:** set `SUPERADMIN_EMAILS` (and/or `SUPERADMIN_USER_IDS`) in Vercel; enable Auth MFA; enroll TOTP; confirm `/api/superadmin/session` returns `aal: aal2`.  
4. **Grow sandbox:** confirm sandbox keys for collections E2E (no real resident charges).

## Go / No-Go (final for this run)

See [`GO_NO_GO_2026-10-03.md`](./GO_NO_GO_2026-10-03.md).

| Track | Decision |
|-------|----------|
| ניהול בניינים | **Conditional Go** |
| גבייה | **No-Go** |
| עומס יעד | **No-Go** |

## Load harness proof (this run)

- Guard unit: 7/7 pass (`vitest run scripts/load/guard.test.mjs`).  
- `BASE_URL=https://bino.casa` → **HARD FAIL** (always).  
- Mock `127.0.0.1:3456` 10s/10conn: ~59.6k rps, 0 errors (proves runner; **not** app capacity).
