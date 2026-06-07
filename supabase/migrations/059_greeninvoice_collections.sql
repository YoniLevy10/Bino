-- Green Invoice (Morning) integration — tenant credentials + collection charges foundation

-- ─── Per-tenant Morning credentials (settings tab) ───
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS greeninvoice_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS greeninvoice_env text NOT NULL DEFAULT 'production',
  ADD COLUMN IF NOT EXISTS greeninvoice_api_key_id text,
  ADD COLUMN IF NOT EXISTS greeninvoice_api_secret text,
  ADD COLUMN IF NOT EXISTS greeninvoice_business_id text,
  ADD COLUMN IF NOT EXISTS greeninvoice_clearing_plugin text,
  ADD COLUMN IF NOT EXISTS greeninvoice_default_doc_type int NOT NULL DEFAULT 300,
  ADD COLUMN IF NOT EXISTS greeninvoice_vat_type int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS greeninvoice_send_invoice_email boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS greeninvoice_remarks_template text,
  ADD COLUMN IF NOT EXISTS greeninvoice_payment_success_url text,
  ADD COLUMN IF NOT EXISTS greeninvoice_payment_failure_url text;

ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_greeninvoice_env_check;
ALTER TABLE public.clients
  ADD CONSTRAINT clients_greeninvoice_env_check
  CHECK (greeninvoice_env IN ('sandbox', 'production'));

ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_greeninvoice_clearing_plugin_check;
ALTER TABLE public.clients
  ADD CONSTRAINT clients_greeninvoice_clearing_plugin_check
  CHECK (
    greeninvoice_clearing_plugin IS NULL
    OR greeninvoice_clearing_plugin IN ('cardcom', 'isracard', 'grow')
  );

ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_greeninvoice_default_doc_type_check;
ALTER TABLE public.clients
  ADD CONSTRAINT clients_greeninvoice_default_doc_type_check
  CHECK (greeninvoice_default_doc_type IN (300, 305, 320));

ALTER TABLE public.clients DROP CONSTRAINT IF EXISTS clients_greeninvoice_vat_type_check;
ALTER TABLE public.clients
  ADD CONSTRAINT clients_greeninvoice_vat_type_check
  CHECK (greeninvoice_vat_type IN (0, 1, 2));

COMMENT ON COLUMN public.clients.greeninvoice_api_key_id IS 'Morning API Key ID (Settings → Developers)';
COMMENT ON COLUMN public.clients.greeninvoice_api_secret IS 'Morning API Key Secret — server writes only via /api/settings/update';
COMMENT ON COLUMN public.clients.greeninvoice_business_id IS 'Selected Morning business when account has multiple businesses';
COMMENT ON COLUMN public.clients.greeninvoice_clearing_plugin IS 'Informational: which clearing plugin is active in Morning (Cardcom/Isracard/Grow)';
COMMENT ON COLUMN public.clients.greeninvoice_default_doc_type IS '300=חשבון עסקה, 305=חשבונית מס, 320=חשבונית מס+קבלה';

-- ─── Collection charges (גביית ועד) ───
CREATE TABLE IF NOT EXISTS public.collection_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  resident_id uuid REFERENCES public.residents(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT '',
  description text,
  amount numeric(12, 2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'ILS',
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'paid', 'failed', 'cancelled')),
  greeninvoice_client_id text,
  greeninvoice_document_id text,
  greeninvoice_document_number int,
  greeninvoice_payment_url text,
  greeninvoice_payment_id text,
  sent_at timestamptz,
  paid_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_collection_charges_client_created
  ON public.collection_charges (client_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_collection_charges_resident
  ON public.collection_charges (resident_id)
  WHERE resident_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_collection_charges_status
  ON public.collection_charges (client_id, status);

COMMENT ON TABLE public.collection_charges IS
  'Vaad/collections charges — linked to Morning documents and payment forms';

-- ─── RLS ───
ALTER TABLE public.collection_charges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS authenticated_tenant_collection_charges ON public.collection_charges;
CREATE POLICY authenticated_tenant_collection_charges ON public.collection_charges
  FOR ALL TO authenticated
  USING (client_id IN (SELECT public.bamakor_my_client_ids()))
  WITH CHECK (client_id IN (SELECT public.bamakor_my_client_ids()));

-- Paid add-on catalog seed
INSERT INTO public.paid_addons_catalog (addon_key, name_he, description_he, price_ils_monthly, is_active, sort_order)
VALUES
  (
    'collections',
    'גביית ועד',
    'חיוב דיירים וקישורי תשלום דרך חשבונית ירוקה (Morning)',
    99,
    true,
    62
  )
ON CONFLICT (addon_key) DO UPDATE SET
  name_he = EXCLUDED.name_he,
  description_he = EXCLUDED.description_he,
  price_ils_monthly = EXCLUDED.price_ils_monthly,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order;
