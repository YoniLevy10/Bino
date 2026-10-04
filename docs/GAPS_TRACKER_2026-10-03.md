# Gaps tracker — paying customers readiness (unified)

**Updated:** 2026-10-04 ~06:45 UTC (final agent close)  
**Prod tip:** `fd803d9` (#244) · MFA #243 · Window A/B · mig 122  
**Cron proof:** `system_logs` row `source=cron.health-check` `message=db_connected` at **2026-10-04 06:00:31 UTC**

Status: **פתוח** / **תוקן בקוד** / **נפרס** / **אומת** / **חסום**

| ID | Topic | Status | Evidence |
|----|-------|--------|----------|
| B1/H1 | 111 WA + REVOKE auth writes | **אומת** | WINDOW_A |
| H8 | 112 soft-delete | **אומת** | WINDOW_A |
| H4 | system_logs + live cron | **אומת** | table + live `db_connected` 2026-10-04 06:00:31Z |
| B2 | 113 idempotency | **אומת** | WINDOW_B_113 · charge `6077ad97…` |
| 122 | anon REVOKE | **אומת** | MIGRATION_122 |
| H7 | Next 16.3.8 | **נפרס** | #231 |
| H2/H3 | Grow webhook harden | **נפרס** | #235 |
| M11 | Report rate limit | **נפרס** | #236 |
| P1 | Viewer WriteAccess | **אומת** | PERMISSIONS_LIVE |
| Cross-org | Isolation | **אומת** | sandbox 404 |
| Perf | Recommendations non-blocking | **אומת** | PERF_AFTER_238 |
| after() detectors | system_logs on fail | **נפרס** | #239 |
| Restore drill | Local dump subset | **אומת** | RESTORE_DRILL |
| Storage DR | Policy + purge gate | **נפרס** | #241 |
| MFA code | Identity + AAL2 gate | **נפרס** | #243 — **enroll = owner** |
| xlsx | exceljs | **נפרס** | #244 |
| Load harness | Guard + refuse prod | **אומת** | #240 · 7/7 + HARD FAIL |
| D3 charges | Classification | **אומת** | COLLECTION_CHARGE_ANOMALY |

### Still owner-only (agent cannot finish)

See [`OWNER_MANUAL_ONLY_2026-10-04.md`](./OWNER_MANUAL_ONLY_2026-10-04.md).

| Topic | Why blocked for agent |
|-------|------------------------|
| Backup list / PITR UI | Management API 401; no Dashboard session |
| Vercel runtime logs / alert channel | MCP OAuth stuck on personal scope (empty `list_teams`) |
| Superadmin MFA enroll + allowlist env | Needs your Vercel env + authenticator |
| Grow sandbox E2E | Needs Grow sandbox credentials |
| Real Next capacity load | Needs healthy local build + local Supabase (agent `.next` broken) |
| D3 treatment decision | Business decision |

## Go / No-Go

| Track | Decision |
|-------|----------|
| ניהול בניינים | **Conditional Go** (owner MFA enroll + backup screenshot recommended) |
| גבייה | **No-Go** until Grow E2E |
| עומס יעד | **No-Go** until measured local app run |
