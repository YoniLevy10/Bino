-- Collections: public pay token, bulk batch tracking, optional period label

ALTER TABLE public.collection_charges
  ADD COLUMN IF NOT EXISTS public_token uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS batch_id uuid,
  ADD COLUMN IF NOT EXISTS period_label text;

-- Backfill any rows that somehow lack a token (IF NOT EXISTS + NOT NULL DEFAULT covers new inserts)
UPDATE public.collection_charges
SET public_token = gen_random_uuid()
WHERE public_token IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_charges_public_token
  ON public.collection_charges (public_token);

CREATE INDEX IF NOT EXISTS idx_collection_charges_batch
  ON public.collection_charges (client_id, batch_id)
  WHERE batch_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_collection_charges_period
  ON public.collection_charges (client_id, period_label)
  WHERE period_label IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_collection_charges_payment_id
  ON public.collection_charges (greeninvoice_payment_id)
  WHERE greeninvoice_payment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_collection_charges_document_id
  ON public.collection_charges (greeninvoice_document_id)
  WHERE greeninvoice_document_id IS NOT NULL;

COMMENT ON COLUMN public.collection_charges.public_token IS
  'Opaque token for Bamakor-hosted /pay/[token] landing';
COMMENT ON COLUMN public.collection_charges.batch_id IS
  'Groups charges created together in a bulk send';
COMMENT ON COLUMN public.collection_charges.period_label IS
  'Optional period tag e.g. 2026-07 for monthly vaad';
