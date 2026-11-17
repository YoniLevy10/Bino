-- Per-building WhatsApp group invite link for manager share-to-group buttons.
-- Invite URLs look like https://chat.whatsapp.com/... — no Meta blast; manual share only.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS whatsapp_group_invite_url text;

COMMENT ON COLUMN public.projects.whatsapp_group_invite_url IS
  'Optional WhatsApp group invite URL (https://chat.whatsapp.com/…) for this building. Used by share-to-group buttons (decisions, etc.). Empty = not configured.';
