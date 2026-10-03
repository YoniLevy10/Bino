# Backup truth — Bamakor (2026-10-03)

**Correction:** Pro plan and `archive_mode=on` **do not** prove that PITR is enabled or that a recoverable backup window is active. Earlier Window A notes that treated “Pro = PITR included” are **wrong**.

## What was verified (no purchase, no production restore)

| Check | Result | Evidence |
|-------|--------|----------|
| Org plan | Levy Tech1 / **Pro** (`tier_pro`) | Supabase MCP `get_organization` |
| Postgres WAL | `archive_mode=on`, `archive_command=/usr/bin/admin-mgr wal-push %p …`, `wal_level=logical`, `archive_timeout=120` | `pg_settings` |
| Management API list backups | **401 Unauthorized** — no `SUPABASE_ACCESS_TOKEN` in agent env | `GET https://api.supabase.com/v1/projects/jsliqlmjksintyigkulq/database/backups` |
| Dashboard Backups UI | **Not opened by agent** (no browser dashboard session) | — |
| PITR add-on | **Not proven.** Docs: PITR is a **paid add-on** for Pro/Team/Enterprise; requires ≥ Small compute. Org metadata returned plan only, no PITR entitlement field via MCP | [Supabase Backups docs](https://supabase.com/docs/guides/platform/backups) |
| Entitled daily backups (docs) | Pro **typically** keeps **7 days** of daily backups | Docs only — **not** confirmed by listing actual backup objects |

## What this means

1. **WAL archiving infrastructure is on** (supports platform backups / PITR *if* enabled).
2. **Daily backups are the Pro default entitlement**, but this run **could not list** actual backup timestamps or retention without Management API token or Dashboard.
3. **PITR must be treated as unproven** until Dashboard → Database → Backups shows Point-in-Time Recovery enabled with earliest/latest restore points, **or** Management API returns PITR metadata.

## Owner action (read-only, ~2 minutes)

1. Open https://supabase.com/dashboard/project/jsliqlmjksintyigkulq/database/backups  
2. Screenshot / note: list of daily backups (dates) **or** PITR earliest/latest.  
3. Optional: create personal access token → `curl -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" "https://api.supabase.com/v1/projects/jsliqlmjksintyigkulq/database/backups"` and paste JSON (no restore).

**Do not** purchase PITR or restore onto Bamakor without a separate written approval.

## Isolated restore drill (executed)

See `docs/RESTORE_DRILL_SANDBOX_2026-10-03.md` — local Postgres dump/restore of **sandbox subset only**. This proves process/RTO for a logical dump; it is **not** a Supabase Dashboard backup restore.
