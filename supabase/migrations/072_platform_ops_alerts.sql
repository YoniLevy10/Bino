-- Platform operator alert dedup (email); not exposed to tenants.

CREATE TABLE IF NOT EXISTS public.platform_ops_alert_sent (
  dedup_key TEXT PRIMARY KEY,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.platform_ops_alert_sent IS
  'Dedup keys for PLATFORM_OPS email alerts (see lib/platform-ops-alert.ts).';

ALTER TABLE public.platform_ops_alert_sent ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.platform_ops_alert_sent FROM anon, authenticated;

DO $$
BEGIN
  CREATE POLICY service_role_bypass_platform_ops_alert_sent ON public.platform_ops_alert_sent
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Strip internal diagnostics from tenant sidebar order (if migration 048 ran).
UPDATE public.clients c
SET sidebar_nav_order = (
  SELECT COALESCE(jsonb_agg(to_jsonb(elem)), '[]'::jsonb)
  FROM jsonb_array_elements_text(c.sidebar_nav_order) AS elem
  WHERE elem NOT IN ('failed_notifications', 'error_logs')
)
WHERE c.sidebar_nav_order IS NOT NULL;
