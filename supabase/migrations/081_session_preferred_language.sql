-- Resident WhatsApp UI language (he | fr | en), persisted per phone + tenant.

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS preferred_language TEXT;

COMMENT ON COLUMN public.sessions.preferred_language IS
  'Resident UI language for outbound WhatsApp templates in this session (he, fr, en).';

ALTER TABLE public.pending_selections
  ADD COLUMN IF NOT EXISTS preferred_language TEXT;

COMMENT ON COLUMN public.pending_selections.preferred_language IS
  'Stashed language before a building session exists (language picker step).';
