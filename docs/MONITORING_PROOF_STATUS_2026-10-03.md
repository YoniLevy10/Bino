# Monitoring proof status (2026-10-03 → 2026-10-04)

## Closed — live cron → `system_logs`

Scheduled Vercel cron ran successfully:

| Field | Value |
|-------|--------|
| `created_at` | **2026-10-04 06:00:31.827636+00** |
| `source` | `cron.health-check` |
| `message` | `db_connected` |
| `level` | `info` |

Also same window: `cron.ticket-health` → `ticket_media_ok` at 06:00:30Z.

Manual “window-a continuous probe” rows from 2026-10-03 do **not** count; the 06:00 UTC scheduled row does.

## Still owner (optional) — Vercel runtime logs / alert channel

| Item | Detail |
|------|--------|
| Vercel MCP | `list_teams` empty; runtime logs 403 for `team_WWxoCoCEGaEAK0e2JknuqGxq` |
| Alert path | Forced-error → Resend/ops not proven without team-scope logs |

**Owner:** re-auth Vercel MCP to team scope (see `OWNER_MANUAL_ONLY_2026-10-04.md` §3). Not required to trust DB-side cron health.
