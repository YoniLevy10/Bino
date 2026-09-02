-- 094_mbrain_strategy.sql
-- Phase B: marketing objectives + structured strategies + campaign plans

CREATE TABLE IF NOT EXISTS public.mbrain_marketing_objectives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.mbrain_organizations(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL REFERENCES public.mbrain_brands(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  goal_type TEXT NOT NULL DEFAULT 'qualified_leads'
    CHECK (goal_type IN ('qualified_leads', 'demos', 'traffic', 'awareness', 'custom')),
  target_count INT,
  max_cpl NUMERIC(12, 2),
  total_budget NUMERIC(12, 2),
  daily_budget NUMERIC(12, 2),
  market TEXT NOT NULL DEFAULT 'IL',
  audience TEXT,
  product_name TEXT,
  currency TEXT NOT NULL DEFAULT 'ILS',
  raw_brief TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'strategy_ready', 'approved', 'archived')),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mbrain_objectives_brand
  ON public.mbrain_marketing_objectives (brand_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.mbrain_strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.mbrain_organizations(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL REFERENCES public.mbrain_brands(id) ON DELETE CASCADE,
  objective_id UUID NOT NULL REFERENCES public.mbrain_marketing_objectives(id) ON DELETE CASCADE,
  version INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_review', 'approved', 'rejected', 'superseded')),
  -- Structured Campaign Plan (Zod-validated JSON) — not free-form prose
  plan JSONB NOT NULL,
  model_provider TEXT,
  model_name TEXT,
  generation_cost_usd NUMERIC(12, 6) NOT NULL DEFAULT 0,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mbrain_strategies_objective
  ON public.mbrain_strategies (objective_id, version DESC);

CREATE TABLE IF NOT EXISTS public.mbrain_campaign_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.mbrain_organizations(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL REFERENCES public.mbrain_brands(id) ON DELETE CASCADE,
  strategy_id UUID NOT NULL REFERENCES public.mbrain_strategies(id) ON DELETE CASCADE,
  objective_id UUID NOT NULL REFERENCES public.mbrain_marketing_objectives(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'preview', 'pending_approval', 'approved', 'launched', 'paused', 'archived')),
  structure JSONB NOT NULL DEFAULT '{}'::jsonb,
  estimated_max_spend NUMERIC(12, 2),
  landing_page_url TEXT,
  idempotency_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_mbrain_campaign_plans_brand
  ON public.mbrain_campaign_plans (brand_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.mbrain_agent_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.mbrain_organizations(id) ON DELETE CASCADE,
  brand_id UUID REFERENCES public.mbrain_brands(id) ON DELETE SET NULL,
  agent TEXT NOT NULL,
  input JSONB NOT NULL DEFAULT '{}'::jsonb,
  model_provider TEXT,
  model_name TEXT,
  tools_used JSONB NOT NULL DEFAULT '[]'::jsonb,
  result JSONB,
  status TEXT NOT NULL DEFAULT 'completed'
    CHECK (status IN ('running', 'completed', 'failed')),
  error_message TEXT,
  cost_usd NUMERIC(12, 6) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.mbrain_agent_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.mbrain_organizations(id) ON DELETE CASCADE,
  agent_run_id UUID REFERENCES public.mbrain_agent_runs(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL,
  target_type TEXT,
  target_id UUID,
  before_state JSONB,
  after_state JSONB,
  approval_id UUID,
  status TEXT NOT NULL DEFAULT 'completed'
    CHECK (status IN ('proposed', 'approved', 'rejected', 'executed', 'failed', 'blocked')),
  external_api_meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.mbrain_marketing_objectives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mbrain_strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mbrain_campaign_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mbrain_agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mbrain_agent_actions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY mbrain_objectives_service ON public.mbrain_marketing_objectives
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY mbrain_strategies_service ON public.mbrain_strategies
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY mbrain_campaign_plans_service ON public.mbrain_campaign_plans
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY mbrain_agent_runs_service ON public.mbrain_agent_runs
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY mbrain_agent_actions_service ON public.mbrain_agent_actions
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY mbrain_objectives_member ON public.mbrain_marketing_objectives
    FOR ALL TO authenticated
    USING (public.mbrain_is_org_member(organization_id))
    WITH CHECK (public.mbrain_is_org_member(organization_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY mbrain_strategies_member ON public.mbrain_strategies
    FOR ALL TO authenticated
    USING (public.mbrain_is_org_member(organization_id))
    WITH CHECK (public.mbrain_is_org_member(organization_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY mbrain_campaign_plans_member ON public.mbrain_campaign_plans
    FOR ALL TO authenticated
    USING (public.mbrain_is_org_member(organization_id))
    WITH CHECK (public.mbrain_is_org_member(organization_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY mbrain_agent_runs_member ON public.mbrain_agent_runs
    FOR SELECT TO authenticated
    USING (public.mbrain_is_org_member(organization_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY mbrain_agent_actions_member ON public.mbrain_agent_actions
    FOR SELECT TO authenticated
    USING (public.mbrain_is_org_member(organization_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
