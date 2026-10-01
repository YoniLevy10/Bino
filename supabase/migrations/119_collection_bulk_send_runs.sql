-- Async collection bulk-send runs (audit #29) — queue + resume like SMS campaigns.
CREATE TABLE IF NOT EXISTS public.collection_bulk_send_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  batch_id uuid NOT NULL,
  created_by uuid,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  items_total int NOT NULL DEFAULT 0,
  created_count int NOT NULL DEFAULT 0,
  sent_count int NOT NULL DEFAULT 0,
  failed_count int NOT NULL DEFAULT 0,
  next_index int NOT NULL DEFAULT 0,
  title_template text NOT NULL,
  period_label text,
  description text,
  send_sms boolean NOT NULL DEFAULT true,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_message text,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_collection_bulk_send_runs_client_status
  ON public.collection_bulk_send_runs (client_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_collection_bulk_send_runs_stale
  ON public.collection_bulk_send_runs (status, updated_at)
  WHERE status IN ('queued', 'running');

ALTER TABLE public.collection_bulk_send_runs ENABLE ROW LEVEL SECURITY;

-- Service-role / API only — no authenticated direct access.
REVOKE ALL ON public.collection_bulk_send_runs FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.collection_bulk_send_runs TO service_role;
