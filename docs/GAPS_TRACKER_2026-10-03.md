# Gaps tracker — paying customers readiness (unified)

**Updated:** 2026-10-03 ~20:15 UTC (execution mode)  
**Prod tip:** `edd27bb` · Vercel `dpl_68zCkLfqbhF8z4PGck5TG2GvUHx9` · merged #234→#231→#232→#233→#236→#235  
**Owners:** Agent = cloud agent this run; Owner = Yoni

Status vocabulary: **פתוח** / **תוקן בקוד** / **נפרס** / **אומת** / **חסום**

| ID | Topic | Status | Owner | Dependency | Next action | Remaining work | Target | Evidence to close |
|----|-------|--------|-------|------------|-------------|----------------|--------|-------------------|
| B1/H1 | Mig 111 WA unique + REVOKE auth writes | **אומת** | Agent | — | Keep monitoring | 0 | done 2026-10-03 | Window A apply + PostgREST 403 |
| H8 | Mig 112 projects.deleted_at | **אומת** | Agent | — | — | 0 | done | Window A |
| H4 | system_logs table | **אומת** (table) / **פתוח** (live cron row) | Agent | CRON_SECRET / 06:00 UTC cron | Trigger health-check with secret or wait for schedule | wait | 2026-10-04 | `system_logs.message=db_connected` from real cron |
| B2 | Mig 113 idempotency_key | **אומת** (schema+UNIQUE) / E2E Grow **פתוח** | Agent | Grow sandbox | Grow E2E when keys available | Grow wait | Go גבייה | WINDOW_B_113 evidence + concurrent 23505 |
| H7 | Next ≥16.2.5 | **נפרס** | Agent | — | — | 0 | done | #231 on prod |
| H2/H3/M2/M3 | Grow webhook harden | **נפרס** | Agent | Grow E2E | Sandbox E2E | Grow wait | Go גבייה | live webhook cases |
| M11 | Public report rate limit | **נפרס** | Agent | — | Optional HMAC later | small | residual | #236 + unit |
| P1 | Viewer WriteAccess gaps | **אומת** | Agent | — | — | 0 | done | `PERMISSIONS_LIVE_EVIDENCE` |
| Cross-org | Service-role isolation | **אומת** | Agent | — | Optional 2nd sandbox org user | 0 for Go | done | 404 on Bamakor ticket ids |
| Anon GRANTs | Core table anon INSERT/UPD/DEL | **אומת** | Agent | — | — | 0 | done | MIGRATION_122 evidence + PostgREST deny |
| Backup/PITR truth | Real backup list + window | **חסום** (token/dashboard) | Owner | Dashboard or access token | List backups; correct PITR claim | owner ~10m | 2026-10-04 | `BACKUP_TRUTH` + screenshot/API JSON |
| Restore drill | Isolated dump vs backup | **אומת** (local subset) | Agent | — | Optional: restore listed daily backup to **new** project | optional | residual | `RESTORE_DRILL_SANDBOX` |
| Storage DR | Object backup | **פתוח** | Owner | Product decision | Define Storage backup policy | design | residual | written policy |
| Perf/PWA | Post-login nav stalls | **תוקן בקוד** (recommendations) / **פתוח** measure-after-deploy | Agent | Merge+deploy this PR | Deploy fix; re-measure dashboard | deploy+30m | Go בניינים | before/after p50 wall times |
| Monitoring | Vercel runtime + alert | **חסום** | Owner | Re-auth Vercel MCP team scope | See exact steps below | owner action | Go בניינים | runtime log of cron + alert |
| Smoke E2E | login→ticket→assign→update→close→file | **אומת** (sandbox) | Agent | — | — | 0 | done | ticket #5/#6 sandbox |
| D3 charges | 4 paid without approve ok | **אומת** classification | Owner | Treatment decision | No status change yet | decision | Go גבייה | classification doc |
| Grow E2E | sandbox charge/invoice | **חסום** | Owner | Grow sandbox keys / D2 | Provide sandbox; no real charge | wait+2–4h work | Go גבייה | E2E transcript |
| MFA / xlsx / scale | Residual | **פתוח** | Owner | Priority | Schedule after Go בניינים | see below | residual | per item |

## Monitoring — exact unblock (Vercel)

Agent MCP currently resolves scope `yonilevy10s-projects` and gets **403** for team `team_WWxoCoCEGaEAK0e2JknuqGxq` (`bino` / `prj_vb7qh0ngxJ02zbjmTI1kt5AUzd4q`). `list_teams` returns empty.

**Owner steps:**

1. In Cursor → MCP / Vercel integration → **Disconnect** then **Reconnect**.  
2. When Google/Vercel OAuth opens, choose the team that owns project **bino** (org id `team_WWxoCoCEGaEAK0e2JknuqGxq`), **not** personal `yonilevy10s-projects` only.  
3. Confirm `list_teams` returns that team and `get_runtime_logs` for `prj_vb7qh0ngxJ02zbjmTI1kt5AUzd4q` succeeds.  
4. Alternatively paste `CRON_SECRET` into the agent once so we can `Authorization: Bearer …` hit `/api/cron/health-check` and prove `system_logs` insert of `db_connected` (cron schedule is **06:00 UTC daily** only).

Probe rows / 401 without secret **do not** close this row.

## Perf before (sandbox manager, prod, 2026-10-03)

Wall time to `networkidle` (ms):

| Route | Cold | Warm | Dominant APIs |
|-------|------|------|---------------|
| /dashboard | 9947 | 6127 | `/api/recommendations` 5–8s (sync detectors), nav-config, page-view |
| /tickets | 3341 | 2962 | nav-config, page-view |
| /collections | 3960 | 3093 | nav-config, page-view |
| /settings | 5853 | 2875 | `/api/settings/read` ~4.8s cold |
| /workers | 2702 | 2855 | nav-config, page-view |

**Fix shipped in this branch:** recommendations GET no longer awaits `runClientDetectors` on stale default loads — schedules via `runAfterResponse`; only `?refresh=1` awaits. After-deploy re-measure required before marking אומת.

## Anon GRANT rationale

Not optional: anon still has table-level write privileges on tickets/projects/workers/residents/charges/… while RLS policies are authenticated-scoped. See proposal SQL `docs/sql-proposals/122_revoke_anon_core_table_writes.sql` (awaiting approval — **not applied**).

## Collections track (prep only)

| Item | Status |
|------|--------|
| 113 apply | Held — no new approval |
| Concurrent idempotency test plan | Ready after 113 |
| Grow E2E / invoice | Blocked on sandbox credentials |
| sim-tx / audit-tx | Classified **test data** — no financial status change |

## Schedule (work vs wait)

See response summary / `docs/GO_SCHEDULE_2026-10-03.md`.
