-- Ownership / distribution fields for residents (CRM parity: סוג בעלות, אחוז בעלות)
ALTER TABLE public.residents
  ADD COLUMN IF NOT EXISTS ownership_type text,
  ADD COLUMN IF NOT EXISTS ownership_percent numeric(5, 2);

COMMENT ON COLUMN public.residents.ownership_type IS 'סוג בעלות (למשל: בעלים, שוכר, משותף, מיופה כוח)';
COMMENT ON COLUMN public.residents.ownership_percent IS 'אחוז בעלות / חלוקה (0–100)';

ALTER TABLE public.residents
  DROP CONSTRAINT IF EXISTS residents_ownership_percent_range;

ALTER TABLE public.residents
  ADD CONSTRAINT residents_ownership_percent_range
  CHECK (
    ownership_percent IS NULL
    OR (ownership_percent >= 0 AND ownership_percent <= 100)
  );
