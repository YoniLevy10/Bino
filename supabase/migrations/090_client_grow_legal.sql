-- Per-tenant legal identity for Grow / clearing website audit.
-- Resident money settles in each client's own Morning account, so Grow must
-- see THAT client's name/phone/address — not a shared Bamakor LEGAL_* page.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS grow_legal_business_name text,
  ADD COLUMN IF NOT EXISTS grow_legal_phone text,
  ADD COLUMN IF NOT EXISTS grow_legal_address text,
  ADD COLUMN IF NOT EXISTS grow_legal_email text;

COMMENT ON COLUMN public.clients.grow_legal_business_name IS
  'Merchant legal name shown on /vaad-pay/{clientId} for Grow audit';
COMMENT ON COLUMN public.clients.grow_legal_phone IS
  'Merchant contact phone for Grow website check (this client, not the platform)';
COMMENT ON COLUMN public.clients.grow_legal_address IS
  'Merchant physical address for Grow website check';
COMMENT ON COLUMN public.clients.grow_legal_email IS
  'Optional merchant email on the public Grow page';
