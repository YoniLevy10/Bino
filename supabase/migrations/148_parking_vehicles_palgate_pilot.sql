-- PalGate / parking pilot (Savion only in app code).
-- Stores vehicle plate identifiers for the חניונים tab.
-- Access: service_role via API only (no authenticated GRANTs).

CREATE TABLE IF NOT EXISTS public.parking_vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  plate text NOT NULL,
  label text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL REFERENCES auth.users (id) ON DELETE SET NULL,
  CONSTRAINT parking_vehicles_plate_len CHECK (char_length(plate) BETWEEN 2 AND 32)
);

CREATE UNIQUE INDEX IF NOT EXISTS parking_vehicles_client_plate_uidx
  ON public.parking_vehicles (client_id, plate);

CREATE INDEX IF NOT EXISTS parking_vehicles_client_created_idx
  ON public.parking_vehicles (client_id, created_at DESC);

COMMENT ON TABLE public.parking_vehicles IS
  'Pilot vehicle plates for PalGate parking tab. App hard-scopes writes/reads to Savion client.';

ALTER TABLE public.parking_vehicles ENABLE ROW LEVEL SECURITY;

-- No policies for authenticated/anon — dashboard APIs use getSupabaseAdmin().
REVOKE ALL ON TABLE public.parking_vehicles FROM PUBLIC;
REVOKE ALL ON TABLE public.parking_vehicles FROM anon;
REVOKE ALL ON TABLE public.parking_vehicles FROM authenticated;
GRANT ALL ON TABLE public.parking_vehicles TO service_role;
