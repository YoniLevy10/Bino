-- W1: series / checklist / who completed (for KPI + next occurrence)

ALTER TABLE public.maintenance_tasks
  ADD COLUMN IF NOT EXISTS series_id UUID NULL;

ALTER TABLE public.maintenance_tasks
  ADD COLUMN IF NOT EXISTS checklist_items JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.maintenance_tasks
  ADD COLUMN IF NOT EXISTS completed_by_user_id UUID NULL;

ALTER TABLE public.maintenance_tasks
  ADD COLUMN IF NOT EXISTS completed_by_worker_id UUID NULL
    REFERENCES public.workers (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_client_series
  ON public.maintenance_tasks (client_id, series_id)
  WHERE deleted_at IS NULL AND series_id IS NOT NULL;

COMMENT ON COLUMN public.maintenance_tasks.series_id IS
  'Shared id across recurring occurrences; first task may set series_id = id';
COMMENT ON COLUMN public.maintenance_tasks.checklist_items IS
  'JSON array of {id, text, done_at|null}';
COMMENT ON COLUMN public.maintenance_tasks.completed_by_user_id IS
  'Manager/user who marked DONE (auth.users id)';
COMMENT ON COLUMN public.maintenance_tasks.completed_by_worker_id IS
  'Worker who marked DONE from portal';
