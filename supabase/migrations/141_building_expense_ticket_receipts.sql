-- PR-F/G: expense → ticket link + private receipt storage bucket.
-- Service-role writes only (building_expenses already revoked from anon/authenticated).

ALTER TABLE public.building_expenses
  ADD COLUMN IF NOT EXISTS ticket_id uuid REFERENCES public.tickets (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.building_expenses.ticket_id IS
  'Optional link from building expense to a maintenance ticket (ops memory).';

CREATE INDEX IF NOT EXISTS idx_building_expenses_ticket
  ON public.building_expenses (client_id, ticket_id)
  WHERE ticket_id IS NOT NULL;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'building-expense-receipts',
  'building-expense-receipts',
  false,
  10485760,
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]::text[]
)
ON CONFLICT (id) DO NOTHING;
