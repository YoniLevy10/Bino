-- Per-client PalGate / parking credentials (productize beyond Vercel env pilot).
-- Env PALGATE_* remains fallback for legacy Savion/Bamakor pilots.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS palgate_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS palgate_device_id text,
  ADD COLUMN IF NOT EXISTS palgate_phone_number text,
  ADD COLUMN IF NOT EXISTS palgate_session_token_hex text,
  ADD COLUMN IF NOT EXISTS palgate_token_type text,
  ADD COLUMN IF NOT EXISTS palgate_base_url text;

COMMENT ON COLUMN public.clients.palgate_enabled IS
  'When true and credentials are set, parking/PalGate is allowed for this tenant (not only pilot allowlist).';
COMMENT ON COLUMN public.clients.palgate_device_id IS
  'PalGate device id (DEVICE or DEVICE:output). Server-only.';
COMMENT ON COLUMN public.clients.palgate_phone_number IS
  'PalGate account phone digits (e.g. 9725…). Server-only.';
COMMENT ON COLUMN public.clients.palgate_session_token_hex IS
  'PalGate Linked Device session token (32 hex). Server-only — never expose to browser.';
COMMENT ON COLUMN public.clients.palgate_token_type IS
  'PalGate token type: sms / primary / secondary (or 0/1/2).';
COMMENT ON COLUMN public.clients.palgate_base_url IS
  'Optional PalGate API base; default https://api1.pal-es.com';
