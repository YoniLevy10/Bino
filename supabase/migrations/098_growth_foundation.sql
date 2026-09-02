-- 098_growth_foundation.sql
-- Growth OS Phase 1: companies, contacts, leads, goals, plans, suppressions
-- Separate from Bamakor clients/residents and from mbrain paid-ads tables.

CREATE TABLE IF NOT EXISTS public.growth_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.mbrain_organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  website TEXT,
  city TEXT,
  country TEXT NOT NULL DEFAULT 'IL',
  phone TEXT,
  email_public TEXT,
  category TEXT,
  buildings_count_est INT,
  company_size_est TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  source_url TEXT,
  confidence NUMERIC(4, 2) NOT NULL DEFAULT 0.5,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_growth_companies_org
  ON public.growth_companies (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.growth_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.mbrain_organizations(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.growth_companies(id) ON DELETE CASCADE,
  full_name TEXT,
  role TEXT,
  email TEXT,
  phone TEXT,
  linkedin_url TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  confidence NUMERIC(4, 2) NOT NULL DEFAULT 0.5,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_growth_contacts_company
  ON public.growth_contacts (company_id);

CREATE TABLE IF NOT EXISTS public.growth_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.mbrain_organizations(id) ON DELETE CASCADE,
  brand_id UUID REFERENCES public.mbrain_brands(id) ON DELETE SET NULL,
  company_id UUID REFERENCES public.growth_companies(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.growth_contacts(id) ON DELETE SET NULL,
  mbrain_lead_id UUID REFERENCES public.mbrain_leads(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN (
      'new', 'researched', 'qualified', 'contacted', 'replied',
      'demo_booked', 'customer', 'disqualified', 'suppressed'
    )),
  score INT NOT NULL DEFAULT 0 CHECK (score >= 0 AND score <= 100),
  score_band TEXT NOT NULL DEFAULT 'cold'
    CHECK (score_band IN ('hot', 'warm', 'cold')),
  score_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  icp_variant TEXT,
  notes TEXT,
  last_touched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_growth_leads_org_score
  ON public.growth_leads (organization_id, score DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_growth_leads_status
  ON public.growth_leads (organization_id, status);

CREATE TABLE IF NOT EXISTS public.growth_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.mbrain_organizations(id) ON DELETE CASCADE,
  brand_id UUID REFERENCES public.mbrain_brands(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  target_demos INT,
  target_qualified_leads INT,
  window_days INT NOT NULL DEFAULT 14,
  max_budget NUMERIC(12, 2),
  currency TEXT NOT NULL DEFAULT 'ILS',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'planned', 'approved', 'active', 'completed', 'cancelled')),
  raw_brief TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.growth_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.mbrain_organizations(id) ON DELETE CASCADE,
  goal_id UUID NOT NULL REFERENCES public.growth_goals(id) ON DELETE CASCADE,
  version INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending_approval'
    CHECK (status IN ('pending_approval', 'approved', 'rejected', 'executing', 'completed')),
  plan JSONB NOT NULL,
  estimated_budget NUMERIC(12, 2),
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.growth_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.mbrain_organizations(id) ON DELETE CASCADE,
  goal_id UUID REFERENCES public.growth_goals(id) ON DELETE SET NULL,
  plan_id UUID REFERENCES public.growth_plans(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES public.growth_leads(id) ON DELETE SET NULL,
  agent TEXT,
  title TEXT NOT NULL,
  task_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'blocked', 'done', 'cancelled')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  requires_approval BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.growth_suppressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.mbrain_organizations(id) ON DELETE CASCADE,
  email TEXT,
  phone TEXT,
  company_id UUID REFERENCES public.growth_companies(id) ON DELETE CASCADE,
  reason TEXT NOT NULL DEFAULT 'opt_out',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_growth_suppressions_email
  ON public.growth_suppressions (organization_id, email)
  WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.growth_learnings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.mbrain_organizations(id) ON DELETE CASCADE,
  brand_id UUID REFERENCES public.mbrain_brands(id) ON DELETE SET NULL,
  category TEXT NOT NULL
    CHECK (category IN ('icp', 'message', 'creative', 'channel', 'offer', 'other')),
  statement TEXT NOT NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence NUMERIC(4, 2) NOT NULL DEFAULT 0.5,
  status TEXT NOT NULL DEFAULT 'hypothesis'
    CHECK (status IN ('hypothesis', 'validated', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.growth_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.growth_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.growth_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.growth_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.growth_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.growth_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.growth_suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.growth_learnings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN CREATE POLICY growth_companies_service ON public.growth_companies FOR ALL TO service_role USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY growth_contacts_service ON public.growth_contacts FOR ALL TO service_role USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY growth_leads_service ON public.growth_leads FOR ALL TO service_role USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY growth_goals_service ON public.growth_goals FOR ALL TO service_role USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY growth_plans_service ON public.growth_plans FOR ALL TO service_role USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY growth_tasks_service ON public.growth_tasks FOR ALL TO service_role USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY growth_suppressions_service ON public.growth_suppressions FOR ALL TO service_role USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY growth_learnings_service ON public.growth_learnings FOR ALL TO service_role USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY growth_companies_member ON public.growth_companies FOR ALL TO authenticated USING (public.mbrain_is_org_member(organization_id)) WITH CHECK (public.mbrain_is_org_member(organization_id)); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY growth_contacts_member ON public.growth_contacts FOR ALL TO authenticated USING (public.mbrain_is_org_member(organization_id)) WITH CHECK (public.mbrain_is_org_member(organization_id)); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY growth_leads_member ON public.growth_leads FOR ALL TO authenticated USING (public.mbrain_is_org_member(organization_id)) WITH CHECK (public.mbrain_is_org_member(organization_id)); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY growth_goals_member ON public.growth_goals FOR ALL TO authenticated USING (public.mbrain_is_org_member(organization_id)) WITH CHECK (public.mbrain_is_org_member(organization_id)); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY growth_plans_member ON public.growth_plans FOR ALL TO authenticated USING (public.mbrain_is_org_member(organization_id)) WITH CHECK (public.mbrain_is_org_member(organization_id)); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY growth_tasks_member ON public.growth_tasks FOR ALL TO authenticated USING (public.mbrain_is_org_member(organization_id)) WITH CHECK (public.mbrain_is_org_member(organization_id)); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY growth_suppressions_member ON public.growth_suppressions FOR ALL TO authenticated USING (public.mbrain_is_org_member(organization_id)) WITH CHECK (public.mbrain_is_org_member(organization_id)); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY growth_learnings_member ON public.growth_learnings FOR SELECT TO authenticated USING (public.mbrain_is_org_member(organization_id)); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE public.growth_leads IS 'Growth OS pipeline — never fabricate; score_reasons must be transparent';
