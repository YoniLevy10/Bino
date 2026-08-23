-- Google Calendar OAuth tokens (per tenant) + link Bamakor events ↔ Google events.
-- Tokens are NEVER exposed via RLS to authenticated clients — API uses service role only.

CREATE TABLE IF NOT EXISTS public.google_calendar_connections (
  client_id UUID PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  google_email TEXT,
  refresh_token TEXT NOT NULL,
  access_token TEXT,
  access_token_expires_at TIMESTAMPTZ,
  calendar_id TEXT NOT NULL DEFAULT 'primary',
  connected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_google_calendar_connections_user
  ON public.google_calendar_connections (user_id);

ALTER TABLE public.google_calendar_connections ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY "service_role_bypass" ON public.google_calendar_connections
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- No authenticated policies — tokens must never be readable via Data API / RLS.
REVOKE ALL ON public.google_calendar_connections FROM authenticated, anon;
GRANT ALL ON public.google_calendar_connections TO service_role;

COMMENT ON TABLE public.google_calendar_connections IS
  'OAuth tokens for pushing office calendar events to the tenant Google Calendar. Refresh/access tokens must only be read via service role.';
ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS google_event_id TEXT;

CREATE INDEX IF NOT EXISTS idx_calendar_events_google_event_id
  ON public.calendar_events (client_id, google_event_id)
  WHERE google_event_id IS NOT NULL;

COMMENT ON COLUMN public.calendar_events.google_event_id IS
  'Google Calendar event id when synced to the connected tenant calendar.';
