-- Field worker site tours (no ticket required).

CREATE TABLE IF NOT EXISTS public.worker_site_tours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  worker_id UUID NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_worker_site_tours_client_completed
  ON public.worker_site_tours (client_id, completed_at DESC);

CREATE INDEX IF NOT EXISTS idx_worker_site_tours_worker_completed
  ON public.worker_site_tours (worker_id, completed_at DESC);

CREATE INDEX IF NOT EXISTS idx_worker_site_tours_project_completed
  ON public.worker_site_tours (project_id, completed_at DESC);

ALTER TABLE public.worker_site_tours ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY "service_role_bypass" ON public.worker_site_tours
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE public.worker_site_tours IS
  'Worker logged building site tours without opening a ticket.';
