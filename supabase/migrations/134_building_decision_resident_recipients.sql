-- Building decisions → resident portal recipients + signature identity links.
-- Apply manually to production (no Supabase preview branches).
-- Extends 133_building_governance_wave4.sql.

-- Link signature stubs to residents / units (portal primary UX).
ALTER TABLE public.building_signature_requests
  ADD COLUMN IF NOT EXISTS resident_id uuid REFERENCES public.residents (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unit_id uuid REFERENCES public.project_units (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS signer_email text;

COMMENT ON COLUMN public.building_signature_requests.resident_id IS
  'When set, signature belongs to a known resident (portal login path).';

CREATE INDEX IF NOT EXISTS idx_building_signature_requests_resident
  ON public.building_signature_requests (client_id, resident_id)
  WHERE resident_id IS NOT NULL;

-- One open/signed stub per resident per decision (idempotent portal + notify).
CREATE UNIQUE INDEX IF NOT EXISTS idx_building_signature_requests_decision_resident
  ON public.building_signature_requests (decision_id, resident_id)
  WHERE resident_id IS NOT NULL;

-- Track who was invited to sign and via which channel (service messages only).
CREATE TABLE IF NOT EXISTS public.building_decision_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  decision_id uuid NOT NULL REFERENCES public.building_decisions (id) ON DELETE CASCADE,
  resident_id uuid NOT NULL REFERENCES public.residents (id) ON DELETE CASCADE,
  unit_id uuid REFERENCES public.project_units (id) ON DELETE SET NULL,
  signature_request_id uuid REFERENCES public.building_signature_requests (id) ON DELETE SET NULL,
  channels text[] NOT NULL DEFAULT '{}',
  sms_status text NOT NULL DEFAULT 'skipped'
    CHECK (sms_status IN ('pending', 'sent', 'failed', 'skipped')),
  email_status text NOT NULL DEFAULT 'skipped'
    CHECK (email_status IN ('pending', 'sent', 'failed', 'skipped')),
  portal_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (decision_id, resident_id)
);

COMMENT ON TABLE public.building_decision_recipients IS
  'Per-resident notify ledger for building decisions (SMS/email → resident portal).';

CREATE INDEX IF NOT EXISTS idx_building_decision_recipients_decision
  ON public.building_decision_recipients (client_id, decision_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_building_decision_recipients_resident
  ON public.building_decision_recipients (client_id, resident_id);

ALTER TABLE public.building_decision_recipients ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.building_decision_recipients FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.building_decision_recipients TO service_role;
