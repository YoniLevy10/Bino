-- Professionals writes only via service_role (API checks paid add-on).

DROP POLICY IF EXISTS authenticated_tenant_professionals ON public.professionals;

CREATE POLICY authenticated_tenant_professionals_select ON public.professionals
  FOR SELECT TO authenticated
  USING (client_id IS NOT NULL AND client_id IN (SELECT public.bamakor_my_client_ids()));
