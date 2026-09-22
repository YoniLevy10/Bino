-- Fix CRITICAL Supabase advisor: rls_disabled_in_public on public._keepalive
-- Tiny ping table (not used by app code). Deny PostgREST anon/authenticated;
-- service_role still bypasses RLS for any future keepalive scripts.

ALTER TABLE public._keepalive ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._keepalive FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public._keepalive FROM anon, authenticated;
REVOKE ALL ON SEQUENCE public._keepalive_id_seq FROM anon, authenticated;

COMMENT ON TABLE public._keepalive IS
  'Project ping / anti-pause helper; service-role only. RLS enabled with no client policies.';
