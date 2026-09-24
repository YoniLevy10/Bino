-- Performance: hot-path indexes, dashboard KPI RPC, professionals SELECT policy merge.
-- Addresses PERFORMANCE_AUDIT_SUPABASE.md Phase 3 + Phase 2.2 KPI.

-- ---------------------------------------------------------------------------
-- Indexes (middleware org chain, RLS helper, activity, attendance, FKs)
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_organization_users_user_id
  ON public.organization_users (user_id);

CREATE INDEX IF NOT EXISTS idx_organizations_client_id
  ON public.organizations (client_id);

CREATE INDEX IF NOT EXISTS idx_ticket_logs_organization_created
  ON public.ticket_logs (organization_id, created_at DESC)
  WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_worker_attendance_events_client_recorded
  ON public.worker_attendance_events (client_id, client_recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_worker_attendance_client_status
  ON public.worker_attendance (client_id, status);

CREATE INDEX IF NOT EXISTS idx_worker_attendance_client_started
  ON public.worker_attendance (client_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_project_id
  ON public.maintenance_tasks (project_id)
  WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_collection_charges_project_id
  ON public.collection_charges (project_id)
  WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_calendar_events_project_id
  ON public.calendar_events (project_id)
  WHERE project_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Dashboard ticket KPI counts — one round-trip instead of four head counts
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.dashboard_ticket_kpi_counts(p_client_id uuid)
RETURNS TABLE (
  active bigint,
  open_count bigint,
  in_progress bigint,
  closed bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    COUNT(*) FILTER (WHERE status IS DISTINCT FROM 'CLOSED')::bigint AS active,
    COUNT(*) FILTER (WHERE status = 'NEW')::bigint AS open_count,
    COUNT(*) FILTER (
      WHERE status IN (
        'ASSIGNED',
        'IN_PROGRESS',
        'WAITING_PARTS',
        'SITE_TOUR',
        'PROFESSIONAL_ESCORT'
      )
    )::bigint AS in_progress,
    COUNT(*) FILTER (WHERE status = 'CLOSED')::bigint AS closed
  FROM public.tickets
  WHERE client_id = p_client_id
    AND deleted_at IS NULL;
$$;

COMMENT ON FUNCTION public.dashboard_ticket_kpi_counts(uuid) IS
  'Single-query dashboard ticket KPIs (active / NEW / in-treatment / CLOSED) for a tenant.';

GRANT EXECUTE ON FUNCTION public.dashboard_ticket_kpi_counts(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_ticket_kpi_counts(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- Professionals: drop duplicate permissive SELECT policies (keep one)
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS authenticated_tenant_professionals ON public.professionals;
DROP POLICY IF EXISTS authenticated_tenant_professionals_select ON public.professionals;

CREATE POLICY authenticated_tenant_professionals_select ON public.professionals
  FOR SELECT TO authenticated
  USING (client_id IS NOT NULL AND client_id IN (SELECT public.bamakor_my_client_ids()));
