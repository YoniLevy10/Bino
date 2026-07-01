-- Revoke PostgREST-exposed RPCs and legacy archive views (security audit follow-up).
-- Admin routes use getSupabaseAdmin() (service_role); these must not be callable from anon/authenticated.

REVOKE EXECUTE ON FUNCTION public.bamakor_reset_client_tickets(uuid) FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.get_client_admin_emails() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_client_admin_emails() TO service_role;

REVOKE ALL ON public.archive_project_bmk1_tickets FROM anon, authenticated;
REVOKE ALL ON public.archive_project_bmk2_tickets FROM anon, authenticated;
REVOKE ALL ON public.archive_project_bmk3_tickets FROM anon, authenticated;
REVOKE ALL ON public.archive_project_bmk4_tickets FROM anon, authenticated;
REVOKE ALL ON public.archive_project_bmk5_tickets FROM anon, authenticated;
