-- W2: cost fields, building assets, ticket←task link

CREATE TABLE IF NOT EXISTS public.building_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'other',
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_building_assets_client_project
  ON public.building_assets (client_id, project_id)
  WHERE deleted_at IS NULL;

ALTER TABLE public.building_assets ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.maintenance_tasks
  ADD COLUMN IF NOT EXISTS asset_id UUID NULL
    REFERENCES public.building_assets (id) ON DELETE SET NULL;

ALTER TABLE public.maintenance_tasks
  ADD COLUMN IF NOT EXISTS estimated_minutes INT NULL;

ALTER TABLE public.maintenance_tasks
  ADD COLUMN IF NOT EXISTS actual_cost_ils NUMERIC(12, 2) NULL;

ALTER TABLE public.tickets
  ADD COLUMN IF NOT EXISTS source_maintenance_task_id UUID NULL
    REFERENCES public.maintenance_tasks (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_source_maintenance_task
  ON public.tickets (source_maintenance_task_id)
  WHERE source_maintenance_task_id IS NOT NULL;

COMMENT ON TABLE public.building_assets IS
  'Lightweight building equipment / assets for maintenance task linking';
COMMENT ON COLUMN public.maintenance_tasks.estimated_minutes IS
  'Optional effort estimate; cost can derive from workers.hourly_rate';
COMMENT ON COLUMN public.tickets.source_maintenance_task_id IS
  'Ticket opened from a failed / escalated maintenance task';
