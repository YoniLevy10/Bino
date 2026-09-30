-- Resident portal content: announcements, amenities, document visibility.

-- ─── Announcements ───
CREATE TABLE IF NOT EXISTS public.project_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  is_pinned boolean NOT NULL DEFAULT false,
  publish_at timestamptz,
  expires_at timestamptz,
  published_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_announcements_project_status
  ON public.project_announcements (project_id, status, publish_at DESC);

CREATE TABLE IF NOT EXISTS public.project_announcement_audience (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES public.project_announcements(id) ON DELETE CASCADE,
  audience_type text NOT NULL CHECK (audience_type IN ('project', 'building', 'unit')),
  building_id uuid REFERENCES public.project_buildings(id) ON DELETE CASCADE,
  unit_id uuid REFERENCES public.project_units(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT paa_building_req CHECK (
    audience_type <> 'building' OR building_id IS NOT NULL
  ),
  CONSTRAINT paa_unit_req CHECK (
    audience_type <> 'unit' OR unit_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_paa_announcement
  ON public.project_announcement_audience (announcement_id);

-- ─── Amenities ───
CREATE TABLE IF NOT EXISTS public.project_amenities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  guidelines text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_amenities_project
  ON public.project_amenities (project_id, sort_order);

-- day_of_week: 0=Sunday … 6=Saturday (Asia/Jerusalem calendar)
CREATE TABLE IF NOT EXISTS public.project_amenity_hours (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  amenity_id uuid NOT NULL REFERENCES public.project_amenities(id) ON DELETE CASCADE,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  opens_at time,
  closes_at time,
  is_closed boolean NOT NULL DEFAULT false,
  CONSTRAINT pah_open_close CHECK (
    is_closed OR (opens_at IS NOT NULL AND closes_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pah_amenity_day
  ON public.project_amenity_hours (amenity_id, day_of_week);

CREATE TABLE IF NOT EXISTS public.project_amenity_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  amenity_id uuid NOT NULL REFERENCES public.project_amenities(id) ON DELETE CASCADE,
  exception_date date NOT NULL,
  opens_at time,
  closes_at time,
  is_closed boolean NOT NULL DEFAULT false,
  note text,
  CONSTRAINT pae_open_close CHECK (
    is_closed OR (opens_at IS NOT NULL AND closes_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pae_amenity_date
  ON public.project_amenity_exceptions (amenity_id, exception_date);

-- ─── Documents: visibility + audience (default internal) ───
ALTER TABLE public.project_documents
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'internal'
    CHECK (visibility IN ('internal', 'residents')),
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS building_id uuid REFERENCES public.project_buildings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_project_documents_visibility
  ON public.project_documents (project_id, visibility)
  WHERE visibility = 'residents';

-- ─── RLS ───
ALTER TABLE public.project_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_announcement_audience ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_amenities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_amenity_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_amenity_exceptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS service_role_bypass_announcements ON public.project_announcements;
CREATE POLICY service_role_bypass_announcements ON public.project_announcements
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS authenticated_tenant_announcements ON public.project_announcements;
CREATE POLICY authenticated_tenant_announcements ON public.project_announcements
  FOR ALL TO authenticated
  USING (client_id IN (SELECT public.bamakor_my_client_ids()))
  WITH CHECK (client_id IN (SELECT public.bamakor_my_client_ids()));

DROP POLICY IF EXISTS service_role_bypass_paa ON public.project_announcement_audience;
CREATE POLICY service_role_bypass_paa ON public.project_announcement_audience
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS authenticated_tenant_paa ON public.project_announcement_audience;
CREATE POLICY authenticated_tenant_paa ON public.project_announcement_audience
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.project_announcements a
      WHERE a.id = announcement_id
        AND a.client_id IN (SELECT public.bamakor_my_client_ids())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.project_announcements a
      WHERE a.id = announcement_id
        AND a.client_id IN (SELECT public.bamakor_my_client_ids())
    )
  );

DROP POLICY IF EXISTS service_role_bypass_amenities ON public.project_amenities;
CREATE POLICY service_role_bypass_amenities ON public.project_amenities
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS authenticated_tenant_amenities ON public.project_amenities;
CREATE POLICY authenticated_tenant_amenities ON public.project_amenities
  FOR ALL TO authenticated
  USING (client_id IN (SELECT public.bamakor_my_client_ids()))
  WITH CHECK (client_id IN (SELECT public.bamakor_my_client_ids()));

DROP POLICY IF EXISTS service_role_bypass_pah ON public.project_amenity_hours;
CREATE POLICY service_role_bypass_pah ON public.project_amenity_hours
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS authenticated_tenant_pah ON public.project_amenity_hours;
CREATE POLICY authenticated_tenant_pah ON public.project_amenity_hours
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.project_amenities a
      WHERE a.id = amenity_id
        AND a.client_id IN (SELECT public.bamakor_my_client_ids())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.project_amenities a
      WHERE a.id = amenity_id
        AND a.client_id IN (SELECT public.bamakor_my_client_ids())
    )
  );

DROP POLICY IF EXISTS service_role_bypass_pae ON public.project_amenity_exceptions;
CREATE POLICY service_role_bypass_pae ON public.project_amenity_exceptions
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS authenticated_tenant_pae ON public.project_amenity_exceptions;
CREATE POLICY authenticated_tenant_pae ON public.project_amenity_exceptions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.project_amenities a
      WHERE a.id = amenity_id
        AND a.client_id IN (SELECT public.bamakor_my_client_ids())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.project_amenities a
      WHERE a.id = amenity_id
        AND a.client_id IN (SELECT public.bamakor_my_client_ids())
    )
  );
