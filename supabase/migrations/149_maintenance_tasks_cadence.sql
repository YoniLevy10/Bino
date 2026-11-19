-- W1: maintenance task cadence (weekly/monthly/quarterly/yearly) for morning board + calendar colors.
-- color_key is derived in app from cadence; stored optionally for overrides.

ALTER TABLE public.maintenance_tasks
  ADD COLUMN IF NOT EXISTS cadence TEXT NOT NULL DEFAULT 'one_off'
    CHECK (cadence IN ('one_off', 'weekly', 'monthly', 'quarterly', 'yearly'));

ALTER TABLE public.maintenance_tasks
  ADD COLUMN IF NOT EXISTS color_key TEXT NULL;

ALTER TABLE public.maintenance_tasks
  ADD COLUMN IF NOT EXISTS calendar_event_id UUID NULL
    REFERENCES public.calendar_events (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_client_cadence
  ON public.maintenance_tasks (client_id, cadence)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN public.maintenance_tasks.cadence IS
  'one_off | weekly | monthly | quarterly | yearly — drives morning board colors';
COMMENT ON COLUMN public.maintenance_tasks.color_key IS
  'Optional override; default derived from cadence in app';
COMMENT ON COLUMN public.maintenance_tasks.calendar_event_id IS
  'Linked office calendar event when synced from task due_at';

-- Calendar: maintenance event type for task bridge (W2)
DO $$
BEGIN
  ALTER TABLE public.calendar_events DROP CONSTRAINT IF EXISTS calendar_events_event_type_check;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

ALTER TABLE public.calendar_events
  DROP CONSTRAINT IF EXISTS calendar_events_event_type_check;

ALTER TABLE public.calendar_events
  ADD CONSTRAINT calendar_events_event_type_check
  CHECK (event_type IN ('committee', 'professional', 'internal', 'other', 'maintenance'));

COMMENT ON COLUMN public.calendar_events.event_type IS
  'committee | professional | internal | other | maintenance';
