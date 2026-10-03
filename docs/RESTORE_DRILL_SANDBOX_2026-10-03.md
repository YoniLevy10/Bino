# Isolated restore drill — sandbox subset (2026-10-03)

**Scope:** local PostgreSQL 16 on the agent VM. **No** Bamakor production restore. **No** paid Supabase preview.

## Method A — fresh logical dump → restore

1. Exported sandbox-scoped rows via PostgREST (manager JWT + RLS): `clients` (1), `projects` (1), `tickets` (5), `workers` (1).
2. Built `sandbox_fresh_dump.sql` (CREATE + INSERT) with integrity marker `SMOKE-RESTORE-MARKER-2026-10-03` embedded in one ticket description.
3. Restored into database `bino_restore_drill`.

| Metric | Value |
|--------|-------|
| RTO | **0.076 s** (tiny subset) |
| Marker rows found | **1** |
| Counts | clients=1, projects=1, tickets=5, workers=1 |

## Method B — existing backup (`pg_dump -Fc`) → restore

1. Took custom-format dump of `bino_restore_drill` → `/var/tmp/restore-drill/existing_backup.dump` (8203 bytes).
2. Created empty `bino_restore_from_backup` and `pg_restore`.

| Metric | Value |
|--------|-------|
| RTO | **0.066 s** |
| Marker rows found | **1** |
| Distinction | Method A = generate SQL dump from live export; Method B = restore from a **previously taken** binary backup file |

## Integrity validation

- Marker string present after both restores.
- Row counts match the exported subset.

## Storage coverage (critical)

| Bucket | Role | In DB dump? |
|--------|------|-------------|
| `ticket-attachments` | Ticket media | **No** — objects in Storage/S3; DB holds metadata/`ticket_attachments` only |
| `project-documents` | Resident portal docs | **No** |
| `client-logos` | Branding | **No** |

**Supabase docs confirm:** database backups do **not** restore deleted Storage objects. A full DR plan needs Storage backup / object versioning separately.

Smoke evidence that Storage writes work for sandbox: object  
`ticket-attachments/adf9e1bd-cde5-4fb5-85a2-cc11376fc199/…jpg` after create-ticket with JPEG.

## What remains for Go buildings

- Confirm **actual** Bamakor daily (or PITR) backups in Dashboard/API (`BACKUP_TRUTH_2026-10-03.md`).
- Optional: timed restore of a **listed** daily backup to a **new** empty project (separate approval; not done here).
