-- Resident portal ticket linkage, resident-visible messages, bot conversations.

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS resident_id uuid REFERENCES public.residents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unit_id uuid REFERENCES public.project_units(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reporter_membership_id uuid
    REFERENCES public.resident_portal_memberships(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS scope text
    CHECK (scope IS NULL OR scope IN ('common', 'private', 'unclear')),
  ADD COLUMN IF NOT EXISTS portal_idempotency_key text;

CREATE INDEX IF NOT EXISTS idx_tickets_resident_id
  ON public.tickets (resident_id)
  WHERE resident_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tickets_reporter_membership
  ON public.tickets (reporter_membership_id)
  WHERE reporter_membership_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_portal_idempotency
  ON public.tickets (reporter_membership_id, portal_idempotency_key)
  WHERE portal_idempotency_key IS NOT NULL AND reporter_membership_id IS NOT NULL;

COMMENT ON COLUMN public.tickets.scope IS
  'common = shared area (management); private = unit (Midrag/contact); unclear = triage';

CREATE TABLE IF NOT EXISTS public.ticket_resident_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  membership_id uuid REFERENCES public.resident_portal_memberships(id) ON DELETE SET NULL,
  author_type text NOT NULL CHECK (author_type IN ('resident', 'staff', 'system')),
  author_user_id uuid,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ticket_resident_messages_ticket
  ON public.ticket_resident_messages (ticket_id, created_at);

CREATE TABLE IF NOT EXISTS public.resident_bot_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  membership_id uuid NOT NULL REFERENCES public.resident_portal_memberships(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rbc_user_membership
  ON public.resident_bot_conversations (user_id, membership_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.resident_bot_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.resident_bot_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content text NOT NULL,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rbm_conversation
  ON public.resident_bot_messages (conversation_id, created_at);

ALTER TABLE public.ticket_resident_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resident_bot_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resident_bot_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_bypass_trm ON public.ticket_resident_messages;
CREATE POLICY service_role_bypass_trm ON public.ticket_resident_messages
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS authenticated_tenant_trm ON public.ticket_resident_messages;
CREATE POLICY authenticated_tenant_trm ON public.ticket_resident_messages
  FOR ALL TO authenticated
  USING (client_id IN (SELECT public.bamakor_my_client_ids()))
  WITH CHECK (client_id IN (SELECT public.bamakor_my_client_ids()));

DROP POLICY IF EXISTS service_role_bypass_rbc ON public.resident_bot_conversations;
CREATE POLICY service_role_bypass_rbc ON public.resident_bot_conversations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS resident_own_bot_conversations ON public.resident_bot_conversations;
CREATE POLICY resident_own_bot_conversations ON public.resident_bot_conversations
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS service_role_bypass_rbm ON public.resident_bot_messages;
CREATE POLICY service_role_bypass_rbm ON public.resident_bot_messages
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS resident_own_bot_messages ON public.resident_bot_messages;
CREATE POLICY resident_own_bot_messages ON public.resident_bot_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.resident_bot_conversations c
      WHERE c.id = conversation_id AND c.user_id = auth.uid()
    )
  );
