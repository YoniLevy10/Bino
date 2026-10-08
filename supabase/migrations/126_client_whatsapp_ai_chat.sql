-- Per-tenant WhatsApp AI chatbot. Empty by default.
-- Live tenants stay on the existing WhatsApp flow until a row is enabled
-- AND WHATSAPP_AI_CHAT_ENABLED=true. Not a column on clients (column GRANTs).

CREATE TABLE IF NOT EXISTS public.client_whatsapp_ai_chat (
  client_id uuid PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.client_whatsapp_ai_chat ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_bypass_client_whatsapp_ai_chat ON public.client_whatsapp_ai_chat;
CREATE POLICY service_role_bypass_client_whatsapp_ai_chat ON public.client_whatsapp_ai_chat
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public.client_whatsapp_ai_chat FROM anon, authenticated;
GRANT ALL ON TABLE public.client_whatsapp_ai_chat TO service_role;

COMMENT ON TABLE public.client_whatsapp_ai_chat IS
  'Opt-in WhatsApp AI chatbot per client. No rows means every tenant uses the existing flow.';
