-- iCount direct collections scaffold (dual-run with Grow).
-- Secrets stay server-only via getSupabaseAdmin — do NOT GRANT to authenticated.
-- Grow columns/routes remain until iCount P0 marks paid via real IPN.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS icount_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS icount_cid text,
  ADD COLUMN IF NOT EXISTS icount_api_token text,
  ADD COLUMN IF NOT EXISTS icount_paypage_id text,
  ADD COLUMN IF NOT EXISTS collections_payment_provider text NOT NULL DEFAULT 'grow';

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_collections_payment_provider_check;

ALTER TABLE public.clients
  ADD CONSTRAINT clients_collections_payment_provider_check
  CHECK (collections_payment_provider IN ('grow', 'icount'));

COMMENT ON COLUMN public.clients.icount_enabled IS
  'Tenant opted in to direct iCount collections (requires cid + token + paypage_id).';
COMMENT ON COLUMN public.clients.icount_cid IS
  'iCount company id (cid). Server writes; prefer not exposing full secrets to browser.';
COMMENT ON COLUMN public.clients.icount_api_token IS
  'iCount API Bearer token. Server-only; never GRANT SELECT to authenticated.';
COMMENT ON COLUMN public.clients.icount_paypage_id IS
  'iCount payment page id used to create pay-now sessions.';
COMMENT ON COLUMN public.clients.collections_payment_provider IS
  'Active collections PSP for new charges: grow (default) or icount. Dual-run until Grow retired.';

ALTER TABLE public.collection_charges
  ADD COLUMN IF NOT EXISTS icount_payment_url text,
  ADD COLUMN IF NOT EXISTS icount_sale_id text,
  ADD COLUMN IF NOT EXISTS icount_doc_id text,
  ADD COLUMN IF NOT EXISTS icount_doc_url text,
  ADD COLUMN IF NOT EXISTS payment_provider text;

COMMENT ON COLUMN public.collection_charges.icount_payment_url IS
  'Hosted iCount pay page URL for the resident (dual-run with grow_payment_url).';
COMMENT ON COLUMN public.collection_charges.icount_sale_id IS
  'iCount sale / session id returned when creating the pay link.';
COMMENT ON COLUMN public.collection_charges.icount_doc_id IS
  'iCount document id after paid IPN (if provided).';
COMMENT ON COLUMN public.collection_charges.icount_doc_url IS
  'iCount document / receipt URL after payment.';
COMMENT ON COLUMN public.collection_charges.payment_provider IS
  'PSP used when the pay link was created: grow | icount (null = legacy grow).';

CREATE INDEX IF NOT EXISTS collection_charges_icount_sale_id_idx
  ON public.collection_charges (icount_sale_id)
  WHERE icount_sale_id IS NOT NULL;
