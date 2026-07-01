-- WhatsApp inbox persistence, SMS campaigns, document signing requests, WA broadcast runs

-- ─── WhatsApp conversations ───
CREATE TABLE IF NOT EXISTS public.whatsapp_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  phone text NOT NULL,
  resident_id uuid REFERENCES public.residents(id) ON DELETE SET NULL,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  last_message_preview text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_conversations_client_phone_unique UNIQUE (client_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_conversations_client_last
  ON public.whatsapp_conversations (client_id, last_message_at DESC);

-- ─── WhatsApp messages ───
CREATE TABLE IF NOT EXISTS public.whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.whatsapp_conversations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('in', 'out')),
  wa_message_id text,
  body text,
  message_type text NOT NULL DEFAULT 'text',
  interactive_payload jsonb,
  ticket_id uuid REFERENCES public.tickets(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'sent',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_conversation_created
  ON public.whatsapp_messages (conversation_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_client_created
  ON public.whatsapp_messages (client_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_whatsapp_messages_wa_id_client
  ON public.whatsapp_messages (client_id, wa_message_id)
  WHERE wa_message_id IS NOT NULL;

COMMENT ON TABLE public.whatsapp_conversations IS 'One thread per resident phone per tenant';
COMMENT ON TABLE public.whatsapp_messages IS 'Inbound/outbound WhatsApp message log for manager inbox';

-- ─── SMS campaigns (extends pilot pattern) ───
CREATE TABLE IF NOT EXISTS public.sms_campaign_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  campaign_name text NOT NULL DEFAULT '',
  message_body text NOT NULL,
  recipients_total int NOT NULL DEFAULT 0,
  sent int NOT NULL DEFAULT 0,
  failed int NOT NULL DEFAULT 0,
  skipped_no_phone int NOT NULL DEFAULT 0,
  dry_run boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_campaign_runs_client_created
  ON public.sms_campaign_runs (client_id, created_at DESC);

-- ─── Document signing requests ───
CREATE TABLE IF NOT EXISTS public.document_sign_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  document_path text NOT NULL,
  document_name text NOT NULL,
  signer_name text,
  signer_phone text,
  signer_email text,
  provider text NOT NULL DEFAULT 'manual_link',
  external_id text,
  sign_url text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'signed', 'declined', 'expired', 'cancelled')),
  sent_at timestamptz,
  signed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_sign_requests_client
  ON public.document_sign_requests (client_id, created_at DESC);

-- ─── WhatsApp broadcast runs ───
CREATE TABLE IF NOT EXISTS public.wa_broadcast_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  template_name text NOT NULL,
  template_language text NOT NULL DEFAULT 'he',
  recipients_total int NOT NULL DEFAULT 0,
  sent int NOT NULL DEFAULT 0,
  failed int NOT NULL DEFAULT 0,
  dry_run boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── RLS ───
ALTER TABLE public.whatsapp_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_campaign_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_sign_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_broadcast_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS authenticated_tenant_whatsapp_conversations ON public.whatsapp_conversations;
CREATE POLICY authenticated_tenant_whatsapp_conversations ON public.whatsapp_conversations
  FOR ALL TO authenticated
  USING (client_id IN (SELECT public.bamakor_my_client_ids()))
  WITH CHECK (client_id IN (SELECT public.bamakor_my_client_ids()));

DROP POLICY IF EXISTS authenticated_tenant_whatsapp_messages ON public.whatsapp_messages;
CREATE POLICY authenticated_tenant_whatsapp_messages ON public.whatsapp_messages
  FOR ALL TO authenticated
  USING (client_id IN (SELECT public.bamakor_my_client_ids()))
  WITH CHECK (client_id IN (SELECT public.bamakor_my_client_ids()));

DROP POLICY IF EXISTS authenticated_tenant_sms_campaign_runs ON public.sms_campaign_runs;
CREATE POLICY authenticated_tenant_sms_campaign_runs ON public.sms_campaign_runs
  FOR ALL TO authenticated
  USING (client_id IN (SELECT public.bamakor_my_client_ids()))
  WITH CHECK (client_id IN (SELECT public.bamakor_my_client_ids()));

DROP POLICY IF EXISTS authenticated_tenant_document_sign_requests ON public.document_sign_requests;
CREATE POLICY authenticated_tenant_document_sign_requests ON public.document_sign_requests
  FOR ALL TO authenticated
  USING (client_id IN (SELECT public.bamakor_my_client_ids()))
  WITH CHECK (client_id IN (SELECT public.bamakor_my_client_ids()));

DROP POLICY IF EXISTS authenticated_tenant_wa_broadcast_runs ON public.wa_broadcast_runs;
CREATE POLICY authenticated_tenant_wa_broadcast_runs ON public.wa_broadcast_runs
  FOR ALL TO authenticated
  USING (client_id IN (SELECT public.bamakor_my_client_ids()))
  WITH CHECK (client_id IN (SELECT public.bamakor_my_client_ids()));

-- Realtime for inbox
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_messages;
EXCEPTION
  WHEN duplicate_object THEN NULL;
  WHEN undefined_object THEN NULL;
END $$;

-- Ensure catalog exists (legacy preview branches may have applied old 051 before catalog DDL)
CREATE TABLE IF NOT EXISTS public.paid_addons_catalog (
  addon_key TEXT PRIMARY KEY,
  name_he TEXT NOT NULL,
  description_he TEXT,
  price_ils_monthly INTEGER NOT NULL CHECK (price_ils_monthly >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Paid add-ons catalog seeds
INSERT INTO public.paid_addons_catalog (addon_key, name_he, description_he, price_ils_monthly, is_active, sort_order)
VALUES
  ('whatsapp_inbox', 'תיבת WhatsApp', 'שיחות דיירים בזמן אמת — צפייה ומענה מהמערכת', 79, true, 60),
  ('campaigns', 'קמפיינים SMS', 'תפוצות מותאמות לדיירי הבניין (ללא אימוג''י)', 49, true, 61)
ON CONFLICT (addon_key) DO UPDATE SET
  name_he = EXCLUDED.name_he,
  description_he = EXCLUDED.description_he,
  price_ils_monthly = EXCLUDED.price_ils_monthly,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order;
