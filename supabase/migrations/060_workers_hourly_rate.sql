-- Field workers: optional hourly rate for attendance cost reports

ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS hourly_rate numeric(10, 2);

COMMENT ON COLUMN public.workers.hourly_rate IS 'Optional hourly rate for worker stamp cost estimates in reports';
