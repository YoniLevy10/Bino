-- External professionals (contractors) — contact book + ticket forwarding via SMS.

CREATE TABLE IF NOT EXISTS public.professionals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT,
  extra_phones TEXT[] NOT NULL DEFAULT '{}',
  trade TEXT,
  company_name TEXT,
  email TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

COMMENT ON TABLE public.professionals IS 'External contractors (plumbers, electricians, etc.) — not field workers with portal access.';
COMMENT ON COLUMN public.professionals.trade IS 'Trade/specialty label (e.g. חשמל, אינסטלציה).';
COMMENT ON COLUMN public.professionals.extra_phones IS 'Additional SMS destinations for the same professional.';

CREATE INDEX IF NOT EXISTS idx_professionals_client_id ON public.professionals (client_id);
CREATE INDEX IF NOT EXISTS idx_professionals_deleted_at ON public.professionals (deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_professionals_client_active ON public.professionals (client_id, is_active);

CREATE UNIQUE INDEX IF NOT EXISTS professionals_phone_client_unique
  ON public.professionals (phone, client_id)
  WHERE phone IS NOT NULL AND deleted_at IS NULL;

ALTER TABLE public.professionals ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY service_role_bypass ON public.professionals
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

DROP POLICY IF EXISTS authenticated_tenant_professionals ON public.professionals;
CREATE POLICY authenticated_tenant_professionals ON public.professionals
  FOR ALL
  TO authenticated
  USING (client_id IS NOT NULL AND client_id IN (SELECT public.bamakor_my_client_ids()))
  WITH CHECK (client_id IS NOT NULL AND client_id IN (SELECT public.bamakor_my_client_ids()));
