-- PROPOSAL ONLY — do not apply without explicit owner approval.
-- Residual risk after Window A (111/121): `authenticated` writes revoked on core tables,
-- but `anon` still holds INSERT/UPDATE/DELETE on several core tables.
--
-- Why this is NOT "optional":
-- 1. Defense in depth: RLS policies on tickets etc. are FOR authenticated only.
--    A future policy mistake or SECURITY DEFINER footgun could expose anon writes.
-- 2. `organizations` / `organization_users` still grant INSERT/UPDATE/DELETE to both
--    anon and authenticated — higher blast radius if RLS is incomplete.
-- 3. Window A already revoked anon on worker_nfc_tags / worker_attendance; core
--    ticket/resident/charge tables were left with anon write GRANTs intentionally
--    out of scope. Closing Go buildings without this REVOKE leaves a documented
--    privilege surface that PostgREST can still attempt (blocked today mainly by RLS).
--
-- Safe for app behavior: browser/anon must not write these tables; all mutations
-- go through API + service_role. Public report uses /api/create-ticket (service role).

BEGIN;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.tickets FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.projects FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.workers FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.residents FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.collection_charges FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.maintenance_tasks FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.sessions FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.worker_attendance_events FROM anon;

-- Org chain: tighten writes; keep SELECT only if existing RLS requires it for auth flows.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.organizations FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.organization_users FROM anon;

-- Optional follow-up (separate approval): also REVOKE INSERT/UPDATE/DELETE FROM authenticated
-- on organizations / organization_users if no legitimate PostgREST write path remains.

COMMIT;
