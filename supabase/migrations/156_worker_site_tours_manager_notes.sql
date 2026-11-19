-- Manager follow-up notes on worker-logged site tours.
-- Worker-authored `notes` stay immutable from the manager UI.

ALTER TABLE public.worker_site_tours
  ADD COLUMN IF NOT EXISTS manager_notes text,
  ADD COLUMN IF NOT EXISTS manager_notes_updated_at timestamptz;

COMMENT ON COLUMN public.worker_site_tours.manager_notes IS
  'Manager follow-up / ops notes on a field tour. Separate from worker notes.';

COMMENT ON COLUMN public.worker_site_tours.manager_notes_updated_at IS
  'Last time manager_notes was saved (UTC).';
