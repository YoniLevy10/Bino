-- W4: org-scoped maintenance template library

CREATE TABLE IF NOT EXISTS public.maintenance_task_template_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_maintenance_template_sets_client
  ON public.maintenance_task_template_sets (client_id)
  WHERE deleted_at IS NULL;

ALTER TABLE public.maintenance_task_template_sets ENABLE ROW LEVEL SECURITY;

COMMENT ON COLUMN public.maintenance_task_template_sets.items IS
  'JSON array of {title, cadence, priority?, checklist?, estimated_minutes?}';
