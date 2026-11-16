-- BINO 2.0 Wave 4 — Building governance (committee + decisions + signature stubs).
-- Hub tabs: ועד / החלטות. Writes via service_role API only (same pattern as 132).

CREATE TABLE IF NOT EXISTS public.building_committee_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  resident_id uuid REFERENCES public.residents (id) ON DELETE SET NULL,
  full_name text NOT NULL,
  role text NOT NULL DEFAULT 'member'
    CHECK (role IN ('chair', 'treasurer', 'secretary', 'member', 'signer')),
  phone text,
  email text,
  term_start date,
  term_end date,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz
);

COMMENT ON TABLE public.building_committee_members IS
  'Building committee roster per project. Ending membership sets is_active=false + ended_at (history kept).';

CREATE INDEX IF NOT EXISTS idx_building_committee_project_active
  ON public.building_committee_members (client_id, project_id, is_active)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_building_committee_project
  ON public.building_committee_members (client_id, project_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.building_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  title text NOT NULL,
  body text,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('draft', 'open', 'passed', 'rejected', 'cancelled')),
  majority_threshold numeric(4, 3) NOT NULL DEFAULT 0.500
    CHECK (majority_threshold > 0 AND majority_threshold <= 1),
  required_signatures integer NOT NULL DEFAULT 1
    CHECK (required_signatures >= 1 AND required_signatures <= 500),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz
);

COMMENT ON TABLE public.building_decisions IS
  'Building decisions / votes. Majority = signed_count / required_signatures >= majority_threshold.';

CREATE INDEX IF NOT EXISTS idx_building_decisions_project
  ON public.building_decisions (client_id, project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_building_decisions_status
  ON public.building_decisions (client_id, project_id, status);

CREATE TABLE IF NOT EXISTS public.building_signature_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects (id) ON DELETE CASCADE,
  decision_id uuid NOT NULL REFERENCES public.building_decisions (id) ON DELETE CASCADE,
  token text NOT NULL,
  signer_name text NOT NULL,
  signer_phone text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'signed', 'declined', 'expired')),
  signature_data_url text,
  signed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);

COMMENT ON TABLE public.building_signature_requests IS
  'Per-signer token links for building decisions. Public page /intake/building-sign/{token}; MVP stores data-URL canvas.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_building_signature_requests_token
  ON public.building_signature_requests (token);

CREATE INDEX IF NOT EXISTS idx_building_signature_requests_decision
  ON public.building_signature_requests (client_id, decision_id, status);

ALTER TABLE public.building_committee_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.building_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.building_signature_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.building_committee_members FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.building_decisions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.building_signature_requests FROM PUBLIC, anon, authenticated;

GRANT ALL ON public.building_committee_members TO service_role;
GRANT ALL ON public.building_decisions TO service_role;
GRANT ALL ON public.building_signature_requests TO service_role;
