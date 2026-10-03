# Monitoring proof status (2026-10-03)

## What does **not** close this gap

- Manual `system_logs` inserts labeled `cron.health-check` / “window-a continuous probe”
- `GET /api/cron/health-check` → **401** without secret

## What is required

1. Authenticated cron invocation that inserts `message=db_connected` (see `app/api/cron/health-check/route.ts`).
2. Controlled error that reaches Vercel runtime logs **and** an alert channel (email/SMS/ops) if configured.

## Current blockers

| Item | Detail |
|------|--------|
| Cron schedule | `vercel.json`: health-check **once daily at 06:00 UTC** — next natural run **2026-10-04 06:00 UTC** |
| CRON_SECRET | Not available in agent env; Vercel `filter_project_envs` → 403 wrong OAuth scope |
| Vercel runtime logs | `get_runtime_logs` → 403 for team `team_WWxoCoCEGaEAK0e2JknuqGxq` |

## Exact owner action

1. Re-authenticate Vercel MCP/OAuth to team **`team_WWxoCoCEGaEAK0e2JknuqGxq`** (project `bino`), not only personal `yonilevy10s-projects`.  
2. **Or** provide `CRON_SECRET` once to the agent.  
3. Then: `curl -H "Authorization: Bearer $CRON_SECRET" https://bino.casa/api/cron/health-check` and confirm new `system_logs` row `db_connected`.  
4. Confirm the same request appears in Vercel Runtime Logs; if ops SMS/email is enabled, confirm alert path for a forced error insert (separate controlled test).
