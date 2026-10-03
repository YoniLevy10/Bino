# Migration 122 — revoke anon core writes (2026-10-03)

**Authorized** in owner execution message. Applied via Supabase `apply_migration` `122_revoke_anon_core_table_writes`.

## REVOKE targets

tickets, projects, workers, residents, collection_charges, maintenance_tasks, sessions, worker_attendance_events, organizations, organization_users — `INSERT, UPDATE, DELETE` from `anon`.

## Post-verify

| Probe | Result |
|-------|--------|
| `has_table_privilege(anon, …, INSERT/UPDATE/DELETE)` on listed tables | **false** |
| PostgREST anon INSERT tickets | **401/42501** permission denied |
| PostgREST anon INSERT organizations | **401/42501** permission denied |
| `POST /api/create-ticket` public (service role) Sandbox | **200** ticket #7 |

SELECT privileges for anon left unchanged where previously granted.
