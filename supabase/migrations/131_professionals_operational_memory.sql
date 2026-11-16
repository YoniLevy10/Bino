-- Operational memory for external professionals: personal rating, note, usage ranking.
-- Used system-wide (forward picker, recommendations) — not only /professionals UI.

ALTER TABLE public.professionals
  ADD COLUMN IF NOT EXISTS personal_rating SMALLINT
    CHECK (personal_rating IS NULL OR (personal_rating >= 1 AND personal_rating <= 5)),
  ADD COLUMN IF NOT EXISTS personal_note TEXT,
  ADD COLUMN IF NOT EXISTS use_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMPTZ;

COMMENT ON COLUMN public.professionals.personal_rating IS 'Manager personal star rating 1–5; NULL = unrated.';
COMMENT ON COLUMN public.professionals.personal_note IS 'Manager personal note (separate from legacy notes).';
COMMENT ON COLUMN public.professionals.use_count IS 'Successful forward / contact count for ranking.';
COMMENT ON COLUMN public.professionals.last_contacted_at IS 'Last successful forward / contact timestamp.';

CREATE INDEX IF NOT EXISTS idx_professionals_client_rank
  ON public.professionals (client_id, personal_rating DESC NULLS LAST, use_count DESC, last_contacted_at DESC NULLS LAST)
  WHERE deleted_at IS NULL AND is_active = true;
