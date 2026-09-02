-- 093_mbrain_foundation.sql
-- Levy Marketing Brain — Phase A multi-tenant foundation
-- Separate from Bamakor clients/organizations to avoid tenant model collisions.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Organizations (Marketing Brain tenants / agencies)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mbrain_organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  autonomy_mode TEXT NOT NULL DEFAULT 'supervised'
    CHECK (autonomy_mode IN ('manual', 'supervised', 'autonomous')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mbrain_organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.mbrain_organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'admin'
    CHECK (role IN ('owner', 'admin', 'analyst', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_mbrain_org_members_user
  ON public.mbrain_organization_members (user_id);
CREATE INDEX IF NOT EXISTS idx_mbrain_org_members_org
  ON public.mbrain_organization_members (organization_id);

-- ---------------------------------------------------------------------------
-- Brands + Brand Brain
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mbrain_brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.mbrain_organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  website TEXT,
  locale TEXT NOT NULL DEFAULT 'he-IL',
  market TEXT NOT NULL DEFAULT 'IL',
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft', 'active', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_mbrain_brands_org
  ON public.mbrain_brands (organization_id);

CREATE TABLE IF NOT EXISTS public.mbrain_brand_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.mbrain_organizations(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL UNIQUE REFERENCES public.mbrain_brands(id) ON DELETE CASCADE,
  product_description TEXT,
  target_customers TEXT,
  geographic_markets JSONB NOT NULL DEFAULT '[]'::jsonb,
  pricing JSONB NOT NULL DEFAULT '{}'::jsonb,
  value_propositions JSONB NOT NULL DEFAULT '[]'::jsonb,
  customer_pains JSONB NOT NULL DEFAULT '[]'::jsonb,
  competitors JSONB NOT NULL DEFAULT '[]'::jsonb,
  differentiators JSONB NOT NULL DEFAULT '[]'::jsonb,
  brand_voice JSONB NOT NULL DEFAULT '{}'::jsonb,
  prohibited_claims JSONB NOT NULL DEFAULT '[]'::jsonb,
  icps JSONB NOT NULL DEFAULT '[]'::jsonb,
  previous_campaigns JSONB NOT NULL DEFAULT '[]'::jsonb,
  successful_ad_angles JSONB NOT NULL DEFAULT '[]'::jsonb,
  unsuccessful_ad_angles JSONB NOT NULL DEFAULT '[]'::jsonb,
  testimonials JSONB NOT NULL DEFAULT '[]'::jsonb,
  landing_pages JSONB NOT NULL DEFAULT '[]'::jsonb,
  onboarding_completed_at TIMESTAMPTZ,
  website_analysis JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mbrain_brand_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.mbrain_organizations(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL REFERENCES public.mbrain_brands(id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL
    CHECK (asset_type IN ('logo', 'screenshot', 'product_image', 'creative', 'other')),
  storage_path TEXT NOT NULL,
  public_url TEXT,
  mime_type TEXT,
  width INT,
  height INT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mbrain_brand_assets_brand
  ON public.mbrain_brand_assets (brand_id);

-- ---------------------------------------------------------------------------
-- Hypotheses (seeded angles — not proven truths)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mbrain_marketing_hypotheses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.mbrain_organizations(id) ON DELETE CASCADE,
  brand_id UUID NOT NULL REFERENCES public.mbrain_brands(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  statement TEXT NOT NULL,
  creative_angle TEXT NOT NULL,
  target_pain TEXT,
  target_persona TEXT,
  status TEXT NOT NULL DEFAULT 'proposed'
    CHECK (status IN ('proposed', 'testing', 'winning', 'losing', 'retired')),
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mbrain_hypotheses_brand
  ON public.mbrain_marketing_hypotheses (brand_id);

-- ---------------------------------------------------------------------------
-- Guardrails (hard financial limits — never AI-authoritative)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mbrain_spending_guardrails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.mbrain_organizations(id) ON DELETE CASCADE,
  brand_id UUID REFERENCES public.mbrain_brands(id) ON DELETE CASCADE,
  scope TEXT NOT NULL DEFAULT 'organization'
    CHECK (scope IN ('organization', 'brand', 'campaign')),
  monthly_spend_limit NUMERIC(12, 2),
  daily_spend_limit NUMERIC(12, 2),
  max_campaign_daily_budget NUMERIC(12, 2),
  max_budget_increase_percentage NUMERIC(6, 2) DEFAULT 20,
  max_cpl NUMERIC(12, 2),
  minimum_data_before_optimization JSONB NOT NULL DEFAULT '{"min_spend":50,"min_impressions":1000,"min_clicks":50,"min_leads":3}'::jsonb,
  auto_pause_enabled BOOLEAN NOT NULL DEFAULT false,
  currency TEXT NOT NULL DEFAULT 'ILS',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mbrain_guardrails_org_scope
  ON public.mbrain_spending_guardrails (organization_id, scope)
  WHERE brand_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mbrain_guardrails_brand_scope
  ON public.mbrain_spending_guardrails (organization_id, brand_id, scope)
  WHERE brand_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Audit + cost tracking (Phase A skeleton)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mbrain_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.mbrain_organizations(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  before_state JSONB,
  after_state JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mbrain_audit_org_created
  ON public.mbrain_audit_logs (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.mbrain_cost_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.mbrain_organizations(id) ON DELETE CASCADE,
  brand_id UUID REFERENCES public.mbrain_brands(id) ON DELETE SET NULL,
  category TEXT NOT NULL
    CHECK (category IN ('ai_llm', 'ai_image', 'infra', 'external', 'meta_ads')),
  provider TEXT,
  model TEXT,
  units NUMERIC(14, 4),
  unit_type TEXT,
  estimated_cost NUMERIC(12, 6) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mbrain_cost_org_created
  ON public.mbrain_cost_events (organization_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- RLS helpers + policies
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mbrain_is_org_member(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.mbrain_organization_members m
    WHERE m.organization_id = p_org_id
      AND m.user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.mbrain_is_org_member(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mbrain_is_org_member(UUID) TO authenticated, service_role;

ALTER TABLE public.mbrain_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mbrain_organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mbrain_brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mbrain_brand_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mbrain_brand_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mbrain_marketing_hypotheses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mbrain_spending_guardrails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mbrain_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mbrain_cost_events ENABLE ROW LEVEL SECURITY;

-- Service role full access
DO $$ BEGIN
  CREATE POLICY mbrain_orgs_service ON public.mbrain_organizations
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY mbrain_members_service ON public.mbrain_organization_members
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY mbrain_brands_service ON public.mbrain_brands
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY mbrain_profiles_service ON public.mbrain_brand_profiles
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY mbrain_assets_service ON public.mbrain_brand_assets
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY mbrain_hypotheses_service ON public.mbrain_marketing_hypotheses
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY mbrain_guardrails_service ON public.mbrain_spending_guardrails
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY mbrain_audit_service ON public.mbrain_audit_logs
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY mbrain_cost_service ON public.mbrain_cost_events
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Authenticated: membership-scoped
DO $$ BEGIN
  CREATE POLICY mbrain_orgs_member_select ON public.mbrain_organizations
    FOR SELECT TO authenticated
    USING (public.mbrain_is_org_member(id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY mbrain_members_self_select ON public.mbrain_organization_members
    FOR SELECT TO authenticated
    USING (public.mbrain_is_org_member(organization_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY mbrain_brands_member_all ON public.mbrain_brands
    FOR ALL TO authenticated
    USING (public.mbrain_is_org_member(organization_id))
    WITH CHECK (public.mbrain_is_org_member(organization_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY mbrain_profiles_member_all ON public.mbrain_brand_profiles
    FOR ALL TO authenticated
    USING (public.mbrain_is_org_member(organization_id))
    WITH CHECK (public.mbrain_is_org_member(organization_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY mbrain_assets_member_all ON public.mbrain_brand_assets
    FOR ALL TO authenticated
    USING (public.mbrain_is_org_member(organization_id))
    WITH CHECK (public.mbrain_is_org_member(organization_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY mbrain_hypotheses_member_all ON public.mbrain_marketing_hypotheses
    FOR ALL TO authenticated
    USING (public.mbrain_is_org_member(organization_id))
    WITH CHECK (public.mbrain_is_org_member(organization_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY mbrain_guardrails_member_select ON public.mbrain_spending_guardrails
    FOR SELECT TO authenticated
    USING (public.mbrain_is_org_member(organization_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY mbrain_audit_member_select ON public.mbrain_audit_logs
    FOR SELECT TO authenticated
    USING (public.mbrain_is_org_member(organization_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY mbrain_cost_member_select ON public.mbrain_cost_events
    FOR SELECT TO authenticated
    USING (public.mbrain_is_org_member(organization_id));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- Seed: Levy agency + Bamakor brand + hypotheses + guardrails
-- ---------------------------------------------------------------------------
INSERT INTO public.mbrain_organizations (id, name, slug, autonomy_mode)
VALUES (
  'a1000000-0000-4000-8000-000000000001',
  'Levy Marketing',
  'levy-marketing',
  'supervised'
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.mbrain_brands (id, organization_id, name, slug, website, locale, market, status)
VALUES (
  'b1000000-0000-4000-8000-000000000001',
  'a1000000-0000-4000-8000-000000000001',
  'במקור',
  'bamakor',
  'https://bamakor.vercel.app',
  'he-IL',
  'IL',
  'active'
)
ON CONFLICT (organization_id, slug) DO NOTHING;

INSERT INTO public.mbrain_brand_profiles (
  organization_id,
  brand_id,
  product_description,
  target_customers,
  geographic_markets,
  pricing,
  value_propositions,
  customer_pains,
  competitors,
  differentiators,
  brand_voice,
  prohibited_claims,
  icps
)
VALUES (
  'a1000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000001',
  'SaaS לניהול אחזקה ותקלות לחברות ניהול נכסים בישראל. מרכז דיווחי דיירים, כרטיסי תקלה, עובדי שטח ותקשורת תפעולית במקום וואטסאפ מפוזר.',
  'חברות ניהול נכסים / ועדי בתים מקצועיים בישראל',
  '["IL"]'::jsonb,
  '{"model":"saas_subscription","currency":"ILS","notes":"תוכניות לפי היקף פרויקטים ותוספים"}'::jsonb,
  '[
    "מרכז תקשורת תפעולית במקום הודעות מפוזרות",
    "היסטוריית תקלות מרכזית ו-SLA",
    "תיאום עובדים ודיירים במקום אחד"
  ]'::jsonb,
  '[
    "בקשות אחזקה מפוזרות בוואטסאפ",
    "אין היסטוריית תקלות מרכזית",
    "ראות חלשה ל-SLA",
    "תיאום עובדים קשה",
    "דיירים שואלים שוב ושוב על סטטוס",
    "הנהלה בלי ראות תפעולית",
    "דיווח ידני"
  ]'::jsonb,
  '[]'::jsonb,
  '[
    "מוצר ישראלי ממוקד חברות ניהול",
    "וואטסאפ + דשבורד + פורטל עובד",
    "RTL עברית מובנה"
  ]'::jsonb,
  '{"tone":"מקצועי, ישיר, תפעולי","language":"he","avoid":["הבטחות מוגזמות","קלישאות שיווקיות ריקות"]}'::jsonb,
  '[
    "מבטיחים 100% חיסכון בזמן",
    "טוענים תאימות רגולטורית ללא אימות"
  ]'::jsonb,
  '[
    {
      "name":"מנהל בחברת ניהול נכסים",
      "geography":"ישראל",
      "status":"hypothesis",
      "notes":"Decision makers at Israeli property management companies — not yet proven."
    }
  ]'::jsonb
)
ON CONFLICT (brand_id) DO NOTHING;

INSERT INTO public.mbrain_spending_guardrails (
  organization_id,
  brand_id,
  scope,
  monthly_spend_limit,
  daily_spend_limit,
  max_campaign_daily_budget,
  max_budget_increase_percentage,
  max_cpl,
  auto_pause_enabled,
  currency
)
VALUES
(
  'a1000000-0000-4000-8000-000000000001',
  NULL,
  'organization',
  10000,
  500,
  300,
  20,
  150,
  false,
  'ILS'
),
(
  'a1000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000001',
  'brand',
  5000,
  200,
  150,
  20,
  150,
  false,
  'ILS'
)
ON CONFLICT DO NOTHING;

INSERT INTO public.mbrain_marketing_hypotheses (
  organization_id, brand_id, title, statement, creative_angle, target_pain, target_persona, status, sort_order
)
SELECT
  'a1000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000001',
  v.title,
  v.statement,
  v.creative_angle,
  v.target_pain,
  'מנהל בחברת ניהול נכסים בישראל',
  'proposed',
  v.sort_order
FROM (
  VALUES
    (
      1,
      'WhatsApp is not a CMMS',
      'Property managers are overwhelmed by resident WhatsApp messages and treat chat threads as a maintenance system.',
      'Your maintenance department should not live inside WhatsApp.',
      'בקשות אחזקה מפוזרות בוואטסאפ'
    ),
    (
      2,
      'Operational visibility',
      'Managers lack a clear view of open tickets, owners, and wait times.',
      'Know exactly what is open, who handles it and how long it has been waiting.',
      'ראות חלשה ל-SLA'
    ),
    (
      3,
      'One place',
      'Residents, workers and managers need a single operational system of record.',
      'One place for residents, workers and property managers.',
      'תיאום עובדים קשה'
    ),
    (
      4,
      'Stop fragmenting',
      'Calls, spreadsheets and WhatsApp create fragmented maintenance ops.',
      'Stop managing maintenance from calls, spreadsheets and WhatsApp.',
      'דיווח ידני'
    ),
    (
      5,
      'Operational control',
      'Israeli PMCs need operational control purpose-built for their market.',
      'Operational control for property management companies.',
      'הנהלה בלי ראות תפעולית'
    )
) AS v(sort_order, title, statement, creative_angle, target_pain)
WHERE NOT EXISTS (
  SELECT 1 FROM public.mbrain_marketing_hypotheses h
  WHERE h.brand_id = 'b1000000-0000-4000-8000-000000000001'
    AND h.title = v.title
);

COMMENT ON TABLE public.mbrain_organizations IS 'Levy Marketing Brain tenants (separate from Bamakor clients)';
COMMENT ON TABLE public.mbrain_brands IS 'Advertised brands; Bamakor is first seed';
COMMENT ON TABLE public.mbrain_marketing_hypotheses IS 'Testable marketing hypotheses — not proven facts';
