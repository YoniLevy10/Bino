-- Subscription plan pricing catalog (Super Admin editable) + one-time setup fee.

CREATE TABLE IF NOT EXISTS public.plan_pricing_catalog (
  plan_tier TEXT PRIMARY KEY CHECK (plan_tier IN ('starter', 'pro', 'business', 'enterprise')),
  name_he TEXT NOT NULL,
  description_he TEXT,
  price_ils_monthly INTEGER CHECK (price_ils_monthly IS NULL OR price_ils_monthly >= 0),
  price_display_he TEXT,
  buildings_max INTEGER CHECK (buildings_max IS NULL OR buildings_max > 0),
  workers_max INTEGER CHECK (workers_max IS NULL OR workers_max > 0),
  tickets_per_month_max INTEGER CHECK (tickets_per_month_max IS NULL OR tickets_per_month_max > 0),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.plan_pricing_catalog IS 'Monthly subscription tiers; prices and labels edited by Super Admin.';
COMMENT ON COLUMN public.plan_pricing_catalog.price_display_he IS 'Shown when price_ils_monthly is NULL (e.g. enterprise custom pricing).';
COMMENT ON COLUMN public.plan_pricing_catalog.buildings_max IS 'Marketing limit; enforcement uses plan-limits.ts + clients.buildings_allowed.';

CREATE TABLE IF NOT EXISTS public.billing_platform_settings (
  id TEXT PRIMARY KEY DEFAULT 'default' CHECK (id = 'default'),
  setup_fee_ils INTEGER NOT NULL DEFAULT 10000 CHECK (setup_fee_ils >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.billing_platform_settings IS 'Global billing knobs (setup fee); single row id=default.';

ALTER TABLE public.plan_pricing_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_platform_settings ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY service_role_bypass ON public.plan_pricing_catalog
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY service_role_bypass ON public.billing_platform_settings
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS authenticated_read_plan_pricing ON public.plan_pricing_catalog;
CREATE POLICY authenticated_read_plan_pricing ON public.plan_pricing_catalog
  FOR SELECT TO authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS authenticated_read_billing_platform_settings ON public.billing_platform_settings;
CREATE POLICY authenticated_read_billing_platform_settings ON public.billing_platform_settings
  FOR SELECT TO authenticated
  USING (true);

INSERT INTO public.billing_platform_settings (id, setup_fee_ils)
VALUES ('default', 10000)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.plan_pricing_catalog (
  plan_tier, name_he, description_he, price_ils_monthly, price_display_he,
  buildings_max, workers_max, tickets_per_month_max, sort_order
) VALUES
  ('starter', 'Starter', 'עד 3 בניינים', 299, NULL, 3, 5, 300, 10),
  ('pro', 'Pro', 'עד 10 בניינים', 499, NULL, 10, 20, 1000, 20),
  ('business', 'Business', 'עד 30 בניינים', 699, NULL, 30, 60, 5000, 30),
  ('enterprise', 'Enterprise', 'ללא הגבלת בניינים', NULL, '₪899+', NULL, NULL, NULL, 40)
ON CONFLICT (plan_tier) DO NOTHING;
