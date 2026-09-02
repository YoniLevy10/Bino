-- 095_mbrain_creatives.sql
-- Phase C: hypothesis-linked copy + creative library

CREATE TABLE IF NOT EXISTS public.mbrain_creatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.mbrain_organizations(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL REFERENCES public.mbrain_brands(id) ON DELETE CASCADE,
  hypothesis_id UUID REFERENCES public.mbrain_marketing_hypotheses(id) ON DELETE SET NULL,
  strategy_id UUID REFERENCES public.mbrain_strategies(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending_review', 'approved', 'rejected', 'archived', 'in_campaign')),
  format TEXT NOT NULL DEFAULT '1:1'
    CHECK (format IN ('1:1', '4:5', '9:16')),
  angle TEXT NOT NULL,
  hook TEXT NOT NULL,
  primary_text TEXT NOT NULL,
  headline TEXT NOT NULL,
  description TEXT,
  cta TEXT,
  offer TEXT,
  target_pain TEXT,
  target_persona TEXT,
  image_prompt TEXT,
  image_provider TEXT,
  image_kind TEXT CHECK (image_kind IS NULL OR image_kind IN ('svg', 'url', 'storage_path')),
  image_content TEXT,
  storage_path TEXT,
  public_url TEXT,
  ai_performance_score NUMERIC(6, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mbrain_creatives_brand
  ON public.mbrain_creatives (brand_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mbrain_creatives_hypothesis
  ON public.mbrain_creatives (hypothesis_id);

CREATE TABLE IF NOT EXISTS public.mbrain_creative_variations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.mbrain_organizations(id) ON DELETE CASCADE,
  creative_id UUID NOT NULL REFERENCES public.mbrain_creatives(id) ON DELETE CASCADE,
  variation_index INT NOT NULL DEFAULT 1,
  primary_text TEXT NOT NULL,
  headline TEXT NOT NULL,
  description TEXT,
  hook TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.mbrain_creatives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mbrain_creative_variations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY mbrain_creatives_service ON public.mbrain_creatives
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY mbrain_creative_variations_service ON public.mbrain_creative_variations
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY mbrain_creatives_member ON public.mbrain_creatives
    FOR ALL TO authenticated
    USING (public.mbrain_is_org_member(organization_id))
    WITH CHECK (public.mbrain_is_org_member(organization_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY mbrain_creative_variations_member ON public.mbrain_creative_variations
    FOR ALL TO authenticated
    USING (public.mbrain_is_org_member(organization_id))
    WITH CHECK (public.mbrain_is_org_member(organization_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
