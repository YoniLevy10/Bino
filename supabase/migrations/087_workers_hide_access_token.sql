-- Hide workers.access_token from PostgREST (authenticated / anon).
-- Portal links and SMS use service_role via API only.
-- Browser mutations already go through /api/create-worker and /api/update-worker.

REVOKE ALL ON TABLE public.workers FROM anon, authenticated;

GRANT SELECT (
  id,
  client_id,
  organization_id,
  full_name,
  name,
  phone,
  extra_phones,
  email,
  role,
  is_active,
  hourly_rate,
  receives_new_ticket_alerts,
  created_at,
  deleted_at
) ON TABLE public.workers TO authenticated;

-- Tighten RLS: authenticated may SELECT within tenant; writes via service_role APIs.
DROP POLICY IF EXISTS authenticated_tenant_workers ON public.workers;
CREATE POLICY authenticated_tenant_workers_select ON public.workers
  FOR SELECT TO authenticated
  USING (client_id IS NOT NULL AND client_id IN (SELECT public.bamakor_my_client_ids()));
