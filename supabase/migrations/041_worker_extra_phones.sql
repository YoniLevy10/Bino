-- Additional phone numbers per worker (e.g. work phone) — all receive SMS notifications.
ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS extra_phones text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.workers.extra_phones IS 'Extra phone numbers for SMS (work phone etc.). Primary phone is in phone.';
