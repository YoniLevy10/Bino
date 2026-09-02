-- 097_mbrain_performance.sql
-- Phase G: Insights snapshots + leads quality scaffold + optimization recommendations

CREATE TABLE IF NOT EXISTS public.mbrain_performance_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.mbrain_organizations(id) ON DELETE CASCADE,
  brand_id UUID REFERENCES public.mbrain_brands(id) ON DELETE SET NULL,
  level TEXT NOT NULL CHECK (level IN ('campaign', 'adset', 'ad')),
  internal_id UUID,
  meta_external_id TEXT,
  date_start DATE NOT NULL,
  date_stop DATE NOT NULL,
  spend NUMERIC(14, 4) NOT NULL DEFAULT 0,
  impressions BIGINT NOT NULL DEFAULT 0,
  reach BIGINT,
  cpm NUMERIC(14, 4),
  clicks BIGINT NOT NULL DEFAULT 0,
  ctr NUMERIC(10, 6),
  cpc NUMERIC(14, 4),
  landing_page_views BIGINT,
  leads BIGINT NOT NULL DEFAULT 0,
  conversions BIGINT,
  cost_per_lead NUMERIC(14, 4),
  frequency NUMERIC(10, 4),
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  data_source TEXT NOT NULL DEFAULT 'meta'
    CHECK (data_source IN ('meta', 'mock')),
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, level, meta_external_id, date_start, date_stop)
);

CREATE INDEX IF NOT EXISTS idx_mbrain_perf_org_date
  ON public.mbrain_performance_snapshots (organization_id, date_start DESC);

CREATE TABLE IF NOT EXISTS public.mbrain_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.mbrain_organizations(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL REFERENCES public.mbrain_brands(id) ON DELETE CASCADE,
  campaign_id UUID REFERENCES public.mbrain_campaigns(id) ON DELETE SET NULL,
  ad_id UUID REFERENCES public.mbrain_ads(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'qualified', 'demo_booked', 'customer', 'disqualified')),
  source TEXT DEFAULT 'meta',
  contact JSONB NOT NULL DEFAULT '{}'::jsonb,
  meta_lead_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mbrain_optimization_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.mbrain_organizations(id) ON DELETE CASCADE,
  brand_id UUID REFERENCES public.mbrain_brands(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES public.mbrain_campaigns(id) ON DELETE SET NULL,
  rule_code TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info'
    CHECK (severity IN ('info', 'warn', 'critical')),
  title TEXT NOT NULL,
  explanation TEXT NOT NULL,
  proposed_action TEXT NOT NULL,
  requires_approval BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'accepted', 'dismissed', 'executed')),
  metrics_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mbrain_automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.mbrain_organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  rule_type TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.mbrain_performance_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mbrain_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mbrain_optimization_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mbrain_automation_rules ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN CREATE POLICY mbrain_perf_service ON public.mbrain_performance_snapshots FOR ALL TO service_role USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY mbrain_leads_service ON public.mbrain_leads FOR ALL TO service_role USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY mbrain_optrec_service ON public.mbrain_optimization_recommendations FOR ALL TO service_role USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY mbrain_autorules_service ON public.mbrain_automation_rules FOR ALL TO service_role USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY mbrain_perf_member ON public.mbrain_performance_snapshots FOR SELECT TO authenticated USING (public.mbrain_is_org_member(organization_id)); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY mbrain_leads_member ON public.mbrain_leads FOR ALL TO authenticated USING (public.mbrain_is_org_member(organization_id)) WITH CHECK (public.mbrain_is_org_member(organization_id)); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY mbrain_optrec_member ON public.mbrain_optimization_recommendations FOR ALL TO authenticated USING (public.mbrain_is_org_member(organization_id)) WITH CHECK (public.mbrain_is_org_member(organization_id)); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY mbrain_autorules_member ON public.mbrain_automation_rules FOR SELECT TO authenticated USING (public.mbrain_is_org_member(organization_id)); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
