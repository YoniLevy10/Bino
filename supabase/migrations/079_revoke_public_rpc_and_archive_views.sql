-- Revoke PostgREST-exposed RPCs and legacy archive views (security audit follow-up).
-- Admin routes use getSupabaseAdmin() (service_role); these must not be callable from anon/authenticated.
-- Idempotent: preview/fresh DBs may lack manually-created prod objects.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'bamakor_reset_client_tickets'
      AND pg_get_function_identity_arguments(p.oid) = 'uuid'
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.bamakor_reset_client_tickets(uuid) FROM anon, authenticated;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'get_client_admin_emails'
      AND pg_get_function_identity_arguments(p.oid) = ''
  ) THEN
    REVOKE EXECUTE ON FUNCTION public.get_client_admin_emails() FROM PUBLIC, anon, authenticated;
    GRANT EXECUTE ON FUNCTION public.get_client_admin_emails() TO service_role;
  END IF;
END $$;

DO $$
DECLARE
  view_name text;
BEGIN
  FOREACH view_name IN ARRAY ARRAY[
    'archive_project_bmk1_tickets',
    'archive_project_bmk2_tickets',
    'archive_project_bmk3_tickets',
    'archive_project_bmk4_tickets',
    'archive_project_bmk5_tickets'
  ]
  LOOP
    IF to_regclass(format('public.%I', view_name)) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', view_name);
    END IF;
  END LOOP;
END $$;
