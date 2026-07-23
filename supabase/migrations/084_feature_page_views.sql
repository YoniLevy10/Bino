-- Dashboard tab / page view telemetry for product usage analytics.
CREATE TABLE IF NOT EXISTS public.feature_page_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  user_id uuid NULL,
  nav_id text NOT NULL,
  path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feature_page_views_client_created
  ON public.feature_page_views (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_feature_page_views_nav_created
  ON public.feature_page_views (nav_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_feature_page_views_created
  ON public.feature_page_views (created_at DESC);

ALTER TABLE public.feature_page_views ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.feature_page_views FROM anon, authenticated;

DO $$
BEGIN
  CREATE POLICY service_role_bypass_feature_page_views ON public.feature_page_views
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE public.feature_page_views IS
  'Tenant dashboard page views (nav tabs); written via service role API only.';
