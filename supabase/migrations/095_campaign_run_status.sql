-- Async campaign / broadcast run status for non-blocking sends.
ALTER TABLE public.sms_campaign_runs
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'completed'
    CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  ADD COLUMN IF NOT EXISTS finished_at timestamptz,
  ADD COLUMN IF NOT EXISTS error_message text;

ALTER TABLE public.wa_broadcast_runs
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'completed'
    CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  ADD COLUMN IF NOT EXISTS finished_at timestamptz,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS created_by uuid;

CREATE INDEX IF NOT EXISTS idx_sms_campaign_runs_client_status
  ON public.sms_campaign_runs (client_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wa_broadcast_runs_client_status
  ON public.wa_broadcast_runs (client_id, status, created_at DESC);
