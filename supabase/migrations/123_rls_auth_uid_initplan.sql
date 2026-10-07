-- Fix auth RLS initplan: wrap auth.uid() in (select …) so it is evaluated once
-- per query instead of per row (Supabase advisor auth_rls_initplan).
-- Tables: resident_portal_memberships, resident_bot_conversations, resident_bot_messages.

DROP POLICY IF EXISTS resident_select_own_memberships ON public.resident_portal_memberships;
CREATE POLICY resident_select_own_memberships ON public.resident_portal_memberships
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS resident_own_bot_conversations ON public.resident_bot_conversations;
CREATE POLICY resident_own_bot_conversations ON public.resident_bot_conversations
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS resident_own_bot_messages ON public.resident_bot_messages;
CREATE POLICY resident_own_bot_messages ON public.resident_bot_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.resident_bot_conversations c
      WHERE c.id = conversation_id AND c.user_id = (select auth.uid())
    )
  );
