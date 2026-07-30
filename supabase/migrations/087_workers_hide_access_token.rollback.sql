-- ROLLBACK for 087_workers_hide_access_token.sql
-- Use only if managers cannot load workers after 087 and you must restore
-- PostgREST access to access_token temporarily.
-- Prefer fixing the portal-link UI instead of rolling this back long-term.

REVOKE ALL ON TABLE public.workers FROM anon, authenticated;

GRANT SELECT ON TABLE public.workers TO authenticated;

DROP POLICY IF EXISTS authenticated_tenant_workers_select ON public.workers;
DROP POLICY IF EXISTS authenticated_tenant_workers ON public.workers;
CREATE POLICY authenticated_tenant_workers ON public.workers
  FOR ALL TO authenticated
  USING (client_id IS NOT NULL AND client_id IN (SELECT public.bamakor_my_client_ids()))
  WITH CHECK (client_id IS NOT NULL AND client_id IN (SELECT public.bamakor_my_client_ids()));
