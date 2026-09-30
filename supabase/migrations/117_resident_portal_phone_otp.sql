-- Phone OTP for shared resident-portal join links (019SMS).
-- Residents match by normalized_phone in the project directory — no per-resident invite blast.

CREATE TABLE IF NOT EXISTS public.resident_portal_phone_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  resident_id uuid NOT NULL REFERENCES public.residents(id) ON DELETE CASCADE,
  normalized_phone text NOT NULL,
  code_hash text NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 5,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rppo_phone_project_open
  ON public.resident_portal_phone_otps (normalized_phone, project_id, created_at DESC)
  WHERE consumed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_rppo_expires
  ON public.resident_portal_phone_otps (expires_at)
  WHERE consumed_at IS NULL;

ALTER TABLE public.resident_portal_phone_otps ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_bypass_rppo ON public.resident_portal_phone_otps;
CREATE POLICY service_role_bypass_rppo ON public.resident_portal_phone_otps
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.resident_portal_phone_otps IS
  'Short-lived SMS OTP codes for resident portal shared-link login. Code stored hashed only.';
