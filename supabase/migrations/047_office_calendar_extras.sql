-- Calendar event types, office geofence, field-worker ticket alerts.

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT 'other'
    CHECK (event_type IN ('committee', 'professional', 'internal', 'other'));

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS office_geofence_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS office_geofence_lng DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS office_geofence_radius_m DOUBLE PRECISION DEFAULT 150;

ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS receives_new_ticket_alerts BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.calendar_events.event_type IS 'committee | professional | internal | other';
COMMENT ON COLUMN public.workers.receives_new_ticket_alerts IS 'SMS on every new ticket for this field worker (client scope).';
