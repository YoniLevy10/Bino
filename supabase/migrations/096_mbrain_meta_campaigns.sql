-- 096_mbrain_meta_campaigns.sql
-- Phase D–F: Meta connections, campaigns, approvals, idempotent launch

CREATE TABLE IF NOT EXISTS public.mbrain_meta_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.mbrain_organizations(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'disconnected'
    CHECK (status IN ('disconnected', 'connected', 'error', 'mock')),
  meta_user_id TEXT,
  -- encrypted token blob (server-only); never select from browser clients intentionally
  access_token_encrypted TEXT,
  token_expires_at TIMESTAMPTZ,
  scopes TEXT[] DEFAULT '{}',
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id)
);

CREATE TABLE IF NOT EXISTS public.mbrain_meta_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.mbrain_organizations(id) ON DELETE CASCADE,
  connection_id UUID REFERENCES public.mbrain_meta_connections(id) ON DELETE SET NULL,
  brand_id UUID REFERENCES public.mbrain_brands(id) ON DELETE SET NULL,
  ad_account_id TEXT NOT NULL,
  ad_account_name TEXT,
  currency TEXT DEFAULT 'ILS',
  page_id TEXT,
  page_name TEXT,
  instagram_id TEXT,
  pixel_id TEXT,
  is_selected BOOLEAN NOT NULL DEFAULT false,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, ad_account_id)
);

CREATE TABLE IF NOT EXISTS public.mbrain_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.mbrain_organizations(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL REFERENCES public.mbrain_brands(id) ON DELETE CASCADE,
  campaign_plan_id UUID REFERENCES public.mbrain_campaign_plans(id) ON DELETE SET NULL,
  strategy_id UUID REFERENCES public.mbrain_strategies(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'preview', 'pending_approval', 'active', 'paused', 'archived', 'failed')),
  objective TEXT NOT NULL DEFAULT 'OUTCOME_LEADS',
  daily_budget NUMERIC(12, 2),
  lifetime_budget NUMERIC(12, 2),
  currency TEXT NOT NULL DEFAULT 'ILS',
  meta_external_id TEXT,
  meta_account_id TEXT,
  landing_page_url TEXT,
  structure JSONB NOT NULL DEFAULT '{}'::jsonb,
  launch_idempotency_key TEXT,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, launch_idempotency_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mbrain_campaigns_meta_ext
  ON public.mbrain_campaigns (organization_id, meta_external_id)
  WHERE meta_external_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.mbrain_ad_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.mbrain_organizations(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.mbrain_campaigns(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  daily_budget NUMERIC(12, 2),
  targeting JSONB NOT NULL DEFAULT '{}'::jsonb,
  meta_external_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mbrain_ads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.mbrain_organizations(id) ON DELETE CASCADE,
  campaign_id UUID NOT NULL REFERENCES public.mbrain_campaigns(id) ON DELETE CASCADE,
  ad_set_id UUID NOT NULL REFERENCES public.mbrain_ad_sets(id) ON DELETE CASCADE,
  creative_id UUID REFERENCES public.mbrain_creatives(id) ON DELETE SET NULL,
  hypothesis_id UUID REFERENCES public.mbrain_marketing_hypotheses(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  meta_external_id TEXT,
  meta_creative_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mbrain_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.mbrain_organizations(id) ON DELETE CASCADE,
  brand_id UUID REFERENCES public.mbrain_brands(id) ON DELETE SET NULL,
  action_type TEXT NOT NULL
    CHECK (action_type IN (
      'launch_campaign',
      'increase_budget',
      'change_geography',
      'increase_max_spend',
      'change_objective'
    )),
  target_type TEXT NOT NULL,
  target_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'executed', 'cancelled')),
  requested_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  budget_approved NUMERIC(12, 2),
  payload JSONB NOT NULL,
  decision_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_mbrain_approvals_pending
  ON public.mbrain_approvals (organization_id, status, created_at DESC);

ALTER TABLE public.mbrain_meta_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mbrain_meta_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mbrain_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mbrain_ad_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mbrain_ads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mbrain_approvals ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN CREATE POLICY mbrain_meta_conn_service ON public.mbrain_meta_connections FOR ALL TO service_role USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY mbrain_meta_acct_service ON public.mbrain_meta_accounts FOR ALL TO service_role USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY mbrain_campaigns_service ON public.mbrain_campaigns FOR ALL TO service_role USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY mbrain_adsets_service ON public.mbrain_ad_sets FOR ALL TO service_role USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY mbrain_ads_service ON public.mbrain_ads FOR ALL TO service_role USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY mbrain_approvals_service ON public.mbrain_approvals FOR ALL TO service_role USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE POLICY mbrain_meta_conn_member ON public.mbrain_meta_connections FOR SELECT TO authenticated USING (public.mbrain_is_org_member(organization_id)); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY mbrain_meta_acct_member ON public.mbrain_meta_accounts FOR ALL TO authenticated USING (public.mbrain_is_org_member(organization_id)) WITH CHECK (public.mbrain_is_org_member(organization_id)); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY mbrain_campaigns_member ON public.mbrain_campaigns FOR ALL TO authenticated USING (public.mbrain_is_org_member(organization_id)) WITH CHECK (public.mbrain_is_org_member(organization_id)); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY mbrain_adsets_member ON public.mbrain_ad_sets FOR ALL TO authenticated USING (public.mbrain_is_org_member(organization_id)) WITH CHECK (public.mbrain_is_org_member(organization_id)); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY mbrain_ads_member ON public.mbrain_ads FOR ALL TO authenticated USING (public.mbrain_is_org_member(organization_id)) WITH CHECK (public.mbrain_is_org_member(organization_id)); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY mbrain_approvals_member ON public.mbrain_approvals FOR ALL TO authenticated USING (public.mbrain_is_org_member(organization_id)) WITH CHECK (public.mbrain_is_org_member(organization_id)); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Seed mock Meta connection for Levy org
INSERT INTO public.mbrain_meta_connections (organization_id, status)
VALUES ('a1000000-0000-4000-8000-000000000001', 'mock')
ON CONFLICT (organization_id) DO NOTHING;

INSERT INTO public.mbrain_meta_accounts (
  organization_id, ad_account_id, ad_account_name, currency, page_id, page_name, is_selected, brand_id
)
VALUES (
  'a1000000-0000-4000-8000-000000000001',
  'act_mock_bamakor',
  'Bamakor Mock Ad Account',
  'ILS',
  'page_mock_bamakor',
  'Bamakor Page (Mock)',
  true,
  'b1000000-0000-4000-8000-000000000001'
)
ON CONFLICT (organization_id, ad_account_id) DO NOTHING;
