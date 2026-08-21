-- Ensure Morning API Key IDs are unique across tenants.
-- Payment settlement follows the Morning account that owns the key;
-- sharing one key across Bamakor clients would mix resident payments.

CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_greeninvoice_api_key_id_unique
  ON public.clients (greeninvoice_api_key_id)
  WHERE greeninvoice_api_key_id IS NOT NULL
    AND btrim(greeninvoice_api_key_id) <> '';

COMMENT ON INDEX public.idx_clients_greeninvoice_api_key_id_unique IS
  'Each Morning API Key ID may belong to only one Bamakor client (per-tenant payout account)';
