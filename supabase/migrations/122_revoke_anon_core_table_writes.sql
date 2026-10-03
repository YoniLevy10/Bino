-- Applied 2026-10-03 via Supabase apply_migration (owner-authorized execution).
-- Residual risk after Window A (111/121): anon still held INSERT/UPDATE/DELETE on core tables.
-- App mutations use service_role APIs; public report uses /api/create-ticket.

BEGIN;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.tickets FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.projects FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.workers FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.residents FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.collection_charges FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.maintenance_tasks FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.sessions FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.worker_attendance_events FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.organizations FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.organization_users FROM anon;

COMMIT;
