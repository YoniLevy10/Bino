-- Security hardening: enable RLS on exposed tables, lock server-only tables,
-- restrict sensitive client columns from PostgREST, private ticket-attachments storage.

-- ─── clients: RLS was missing (critical Supabase advisor alert) ───

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY service_role_bypass_clients ON public.clients
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Policy from 022 may already exist; ensure tenant-scoped read for authenticated users.
DO $$
BEGIN
  CREATE POLICY authenticated_read_client_of_member_org ON public.clients
    FOR SELECT TO authenticated
    USING (
      EXISTS (
        SELECT 1
        FROM public.organization_users ou
        JOIN public.organizations o ON o.id = ou.organization_id
        WHERE ou.user_id = auth.uid()
          AND o.client_id = clients.id
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- No direct PostgREST writes; dashboard uses /api/settings/update (service role).
REVOKE ALL ON TABLE public.clients FROM anon, authenticated;

GRANT SELECT (
  id,
  name,
  company_name,
  logo_url,
  preferred_language,
  manager_phone,
  default_worker_phone,
  sms_on_ticket_open,
  sms_on_ticket_close,
  whatsapp_business_phone,
  whatsapp_phone_number_id,
  sms_sender_name,
  plan_tier,
  buildings_allowed,
  sidebar_nav_order,
  sidebar_nav_labels,
  enabled_nav_features,
  greeninvoice_enabled,
  greeninvoice_env,
  greeninvoice_api_key_id,
  greeninvoice_business_id,
  greeninvoice_clearing_plugin,
  greeninvoice_default_doc_type,
  greeninvoice_vat_type,
  greeninvoice_send_invoice_email,
  greeninvoice_remarks_template,
  greeninvoice_payment_success_url,
  greeninvoice_payment_failure_url,
  office_geofence_lat,
  office_geofence_lng,
  office_geofence_radius_m,
  max_workers,
  max_residents,
  max_tickets_per_month
) ON TABLE public.clients TO authenticated;

-- ─── Server-only tables (no tenant browser access) ───

ALTER TABLE public.failed_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processed_webhooks ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.failed_notifications FROM anon, authenticated;
REVOKE ALL ON TABLE public.processed_webhooks FROM anon, authenticated;

DO $$
BEGIN
  CREATE POLICY service_role_bypass_failed_notifications ON public.failed_notifications
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY service_role_bypass_processed_webhooks ON public.processed_webhooks
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Addon tables created without RLS (050 / 054) ───

ALTER TABLE public.project_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_pilot_sms_runs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.project_documents FROM anon;
REVOKE ALL ON TABLE public.project_pilot_sms_runs FROM anon;

DO $$
BEGIN
  CREATE POLICY service_role_bypass_project_documents ON public.project_documents
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY service_role_bypass_project_pilot_sms_runs ON public.project_pilot_sms_runs
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS authenticated_tenant_project_documents ON public.project_documents;
CREATE POLICY authenticated_tenant_project_documents ON public.project_documents
  FOR SELECT TO authenticated
  USING (client_id IN (SELECT public.bamakor_my_client_ids()));

DROP POLICY IF EXISTS authenticated_tenant_project_pilot_sms_runs ON public.project_pilot_sms_runs;
CREATE POLICY authenticated_tenant_project_pilot_sms_runs ON public.project_pilot_sms_runs
  FOR SELECT TO authenticated
  USING (client_id IN (SELECT public.bamakor_my_client_ids()));

GRANT SELECT ON TABLE public.project_documents TO authenticated;
GRANT SELECT ON TABLE public.project_pilot_sms_runs TO authenticated;

-- ─── Internal ops tables: explicit deny via RLS (service role bypasses) ───

REVOKE ALL ON TABLE public.audit_log FROM anon, authenticated;
REVOKE ALL ON TABLE public.system_logs FROM anon, authenticated;
REVOKE ALL ON TABLE public.platform_ops_alert_sent FROM anon, authenticated;
REVOKE ALL ON TABLE public.worker_push_subscriptions FROM anon, authenticated;

DO $$
BEGIN
  CREATE POLICY service_role_bypass_audit_log ON public.audit_log
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY service_role_bypass_system_logs ON public.system_logs
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY service_role_bypass_platform_ops_alert_sent ON public.platform_ops_alert_sent
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── ticket-attachments storage: private bucket + tenant-scoped read ───

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('ticket-attachments', 'ticket-attachments', false, 5242880)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS ticket_attachments_authenticated_select ON storage.objects;
CREATE POLICY ticket_attachments_authenticated_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'ticket-attachments'
    AND EXISTS (
      SELECT 1
      FROM public.tickets t
      WHERE t.id::text = split_part(name, '/', 1)
        AND t.client_id IS NOT NULL
        AND t.client_id IN (SELECT public.bamakor_my_client_ids())
    )
  );
