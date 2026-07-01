-- Paid add-ons catalog (global pricing) + per-client subscriptions.

CREATE TABLE IF NOT EXISTS public.paid_addons_catalog (
  addon_key TEXT PRIMARY KEY,
  name_he TEXT NOT NULL,
  description_he TEXT,
  price_ils_monthly INTEGER NOT NULL CHECK (price_ils_monthly >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.paid_addons_catalog IS 'Global catalog of paid add-ons; prices edited by Super Admin.';
COMMENT ON COLUMN public.paid_addons_catalog.price_ils_monthly IS 'Monthly price in whole ILS (agorot not used).';

CREATE TABLE IF NOT EXISTS public.client_paid_addons (
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  addon_key TEXT NOT NULL REFERENCES public.paid_addons_catalog(addon_key) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  enabled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, addon_key)
);

CREATE INDEX IF NOT EXISTS idx_client_paid_addons_client ON public.client_paid_addons (client_id);

ALTER TABLE public.paid_addons_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_paid_addons ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY service_role_bypass ON public.paid_addons_catalog
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY service_role_bypass ON public.client_paid_addons
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS authenticated_read_paid_addons_catalog ON public.paid_addons_catalog;
CREATE POLICY authenticated_read_paid_addons_catalog ON public.paid_addons_catalog
  FOR SELECT TO authenticated
  USING (is_active = true);

DROP POLICY IF EXISTS authenticated_tenant_client_paid_addons ON public.client_paid_addons;
CREATE POLICY authenticated_tenant_client_paid_addons ON public.client_paid_addons
  FOR SELECT TO authenticated
  USING (client_id IN (SELECT public.bamakor_my_client_ids()));

INSERT INTO public.paid_addons_catalog (addon_key, name_he, description_he, price_ils_monthly, sort_order)
VALUES (
  'professionals',
  'אנשי מקצוע',
  'פנקס קבלנים חיצוניים והעברת תקלות ב-SMS עם פרטי הבניין והדייר.',
  49,
  10
)
ON CONFLICT (addon_key) DO NOTHING;
