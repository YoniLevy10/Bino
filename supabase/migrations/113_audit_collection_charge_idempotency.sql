-- Audit #28: client-supplied idempotency key for charge create / bulk-send.
ALTER TABLE public.collection_charges
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_collection_charges_client_idempotency
  ON public.collection_charges (client_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMENT ON COLUMN public.collection_charges.idempotency_key IS
  'Optional client Idempotency-Key; unique per client to prevent double-create on retry.';
