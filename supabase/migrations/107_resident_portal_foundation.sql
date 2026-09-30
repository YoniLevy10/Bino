-- Resident portal foundation: units, memberships, invites, project portal flags.
-- Does NOT grant residents organization_users access.

-- ─── Projects: city + portal enable ───
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS resident_portal_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS resident_portal_private_ticket_policy text NOT NULL DEFAULT 'midrag_search',
  ADD COLUMN IF NOT EXISTS resident_portal_contact_phone text,
  ADD COLUMN IF NOT EXISTS resident_portal_contact_email text;

COMMENT ON COLUMN public.projects.city IS
  'Explicit city for Midrag/search; do not infer from free-text address.';
COMMENT ON COLUMN public.projects.resident_portal_enabled IS
  'Pilot/feature flag — portal APIs require true for the project.';
COMMENT ON COLUMN public.projects.resident_portal_private_ticket_policy IS
  'How private-unit tickets are handled: midrag_search | contact_only | disabled';

-- ─── Buildings (optional within a multi-building project) ───
CREATE TABLE IF NOT EXISTS public.project_buildings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_buildings_client_project_chk CHECK (client_id IS NOT NULL AND project_id IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_project_buildings_project_name
  ON public.project_buildings (project_id, name);
CREATE INDEX IF NOT EXISTS idx_project_buildings_client
  ON public.project_buildings (client_id);

-- ─── Units ───
CREATE TABLE IF NOT EXISTS public.project_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  building_id uuid REFERENCES public.project_buildings(id) ON DELETE SET NULL,
  unit_number text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_units_unit_number_nonempty CHECK (length(trim(unit_number)) > 0)
);

-- Unique unit per project+building (NULL building treated as one bucket via coalesce sentinel in unique index)
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_units_unique_number
  ON public.project_units (
    project_id,
    COALESCE(building_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(trim(unit_number))
  );
CREATE INDEX IF NOT EXISTS idx_project_units_client_project
  ON public.project_units (client_id, project_id);

ALTER TABLE public.residents
  ADD COLUMN IF NOT EXISTS unit_id uuid REFERENCES public.project_units(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_residents_unit_id ON public.residents (unit_id)
  WHERE unit_id IS NOT NULL;

-- Cautious backfill: one unit per distinct apartment_number per project when all non-null.
-- Does not invent buildings. Ambiguous multi-building cases stay without unit_id.
INSERT INTO public.project_units (client_id, project_id, unit_number)
SELECT DISTINCT r.client_id, r.project_id, trim(r.apartment_number)
FROM public.residents r
WHERE r.deleted_at IS NULL
  AND r.client_id IS NOT NULL
  AND r.project_id IS NOT NULL
  AND r.apartment_number IS NOT NULL
  AND length(trim(r.apartment_number)) > 0
  AND NOT EXISTS (
    SELECT 1
    FROM public.tickets t
    WHERE t.project_id = r.project_id
      AND t.building_number IS NOT NULL
      AND length(trim(t.building_number)) > 0
      AND t.deleted_at IS NULL
    GROUP BY t.project_id
    HAVING count(DISTINCT trim(t.building_number)) > 1
  )
ON CONFLICT DO NOTHING;

UPDATE public.residents r
SET unit_id = u.id
FROM public.project_units u
WHERE r.unit_id IS NULL
  AND r.deleted_at IS NULL
  AND r.project_id = u.project_id
  AND r.client_id = u.client_id
  AND u.building_id IS NULL
  AND r.apartment_number IS NOT NULL
  AND lower(trim(r.apartment_number)) = lower(trim(u.unit_number));

-- ─── Memberships ───
CREATE TABLE IF NOT EXISTS public.resident_portal_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  resident_id uuid NOT NULL REFERENCES public.residents(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES public.project_units(id) ON DELETE SET NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'owner'
    CHECK (role IN ('owner', 'renter', 'other')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'revoked')),
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_to timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoked_by uuid
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rpm_user_resident_active
  ON public.resident_portal_memberships (user_id, resident_id)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_rpm_user_status
  ON public.resident_portal_memberships (user_id, status);
CREATE INDEX IF NOT EXISTS idx_rpm_client_project
  ON public.resident_portal_memberships (client_id, project_id);
CREATE INDEX IF NOT EXISTS idx_rpm_resident
  ON public.resident_portal_memberships (resident_id);

-- ─── Invites ───
CREATE TABLE IF NOT EXISTS public.resident_portal_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  resident_id uuid NOT NULL REFERENCES public.residents(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES public.project_units(id) ON DELETE SET NULL,
  role text NOT NULL DEFAULT 'owner'
    CHECK (role IN ('owner', 'renter', 'other')),
  email text NOT NULL,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  used_by uuid,
  revoked_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rpi_token_hash
  ON public.resident_portal_invites (token_hash);
CREATE INDEX IF NOT EXISTS idx_rpi_email_project
  ON public.resident_portal_invites (lower(email), project_id);
CREATE INDEX IF NOT EXISTS idx_rpi_resident
  ON public.resident_portal_invites (resident_id);

-- ─── Helper: active portal memberships for auth.uid() ───
CREATE OR REPLACE FUNCTION public.resident_portal_my_membership_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT m.id
  FROM public.resident_portal_memberships m
  WHERE m.user_id = auth.uid()
    AND m.status = 'active'
    AND (m.valid_to IS NULL OR m.valid_to > now())
    AND m.revoked_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.resident_portal_my_membership_ids() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resident_portal_my_membership_ids() TO authenticated;

CREATE OR REPLACE FUNCTION public.resident_portal_has_active_membership()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.resident_portal_my_membership_ids());
$$;

REVOKE ALL ON FUNCTION public.resident_portal_has_active_membership() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resident_portal_has_active_membership() TO authenticated;

-- ─── RLS ───
ALTER TABLE public.project_buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resident_portal_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resident_portal_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_bypass_project_buildings ON public.project_buildings;
CREATE POLICY service_role_bypass_project_buildings ON public.project_buildings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS authenticated_tenant_project_buildings ON public.project_buildings;
CREATE POLICY authenticated_tenant_project_buildings ON public.project_buildings
  FOR ALL TO authenticated
  USING (client_id IN (SELECT public.bamakor_my_client_ids()))
  WITH CHECK (client_id IN (SELECT public.bamakor_my_client_ids()));

DROP POLICY IF EXISTS service_role_bypass_project_units ON public.project_units;
CREATE POLICY service_role_bypass_project_units ON public.project_units
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS authenticated_tenant_project_units ON public.project_units;
CREATE POLICY authenticated_tenant_project_units ON public.project_units
  FOR ALL TO authenticated
  USING (client_id IN (SELECT public.bamakor_my_client_ids()))
  WITH CHECK (client_id IN (SELECT public.bamakor_my_client_ids()));

DROP POLICY IF EXISTS service_role_bypass_rpm ON public.resident_portal_memberships;
CREATE POLICY service_role_bypass_rpm ON public.resident_portal_memberships
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Residents may SELECT their own memberships only (writes via service_role APIs).
DROP POLICY IF EXISTS resident_select_own_memberships ON public.resident_portal_memberships;
CREATE POLICY resident_select_own_memberships ON public.resident_portal_memberships
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS authenticated_tenant_manage_rpm ON public.resident_portal_memberships;
CREATE POLICY authenticated_tenant_manage_rpm ON public.resident_portal_memberships
  FOR ALL TO authenticated
  USING (client_id IN (SELECT public.bamakor_my_client_ids()))
  WITH CHECK (client_id IN (SELECT public.bamakor_my_client_ids()));

DROP POLICY IF EXISTS service_role_bypass_rpi ON public.resident_portal_invites;
CREATE POLICY service_role_bypass_rpi ON public.resident_portal_invites
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS authenticated_tenant_manage_rpi ON public.resident_portal_invites;
CREATE POLICY authenticated_tenant_manage_rpi ON public.resident_portal_invites
  FOR ALL TO authenticated
  USING (client_id IN (SELECT public.bamakor_my_client_ids()))
  WITH CHECK (client_id IN (SELECT public.bamakor_my_client_ids()));

COMMENT ON TABLE public.resident_portal_memberships IS
  'Portal access: one Auth user may have multiple unit memberships across clients/projects.';
COMMENT ON TABLE public.resident_portal_invites IS
  'Short-lived invite tokens (hash only). Acceptance requires verified email match.';
