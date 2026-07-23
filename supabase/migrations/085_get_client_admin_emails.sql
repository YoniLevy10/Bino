-- Ensure get_client_admin_emails exists for superadmin stats (was missing from migration history).
CREATE OR REPLACE FUNCTION public.get_client_admin_emails()
RETURNS TABLE (client_id uuid, email text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT
    o.client_id,
    u.email::text AS email
  FROM public.organization_users ou
  JOIN public.organizations o ON o.id = ou.organization_id
  JOIN auth.users u ON u.id = ou.user_id
  WHERE o.client_id IS NOT NULL
    AND ou.role = 'admin'
    AND u.email IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.get_client_admin_emails() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_client_admin_emails() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_client_admin_emails() TO service_role;

COMMENT ON FUNCTION public.get_client_admin_emails() IS
  'Superadmin helper: admin emails per client via organization_users; service_role only.';
