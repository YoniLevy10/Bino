-- Sarah meeting + Fixly prep: worker notify prefs, escort flag, maintenance tasks, tour photos.

-- 1) Worker notification channel prefs + escort capability (per-worker, not hardcoded names)
ALTER TABLE public.workers
  ADD COLUMN IF NOT EXISTS notify_sms BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_whatsapp BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notify_push BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_mark_professional_escort BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.workers.notify_sms IS 'Send SMS on ticket assignment (and similar worker alerts).';
COMMENT ON COLUMN public.workers.notify_whatsapp IS 'Send WhatsApp template on ticket assignment.';
COMMENT ON COLUMN public.workers.notify_push IS 'Send Web Push on ticket assignment.';
COMMENT ON COLUMN public.workers.can_mark_professional_escort IS 'Worker portal may mark PROFESSIONAL_ESCORT with note/photo without closing.';

-- 2) Maintenance tasks (separate from tickets)
CREATE TABLE IF NOT EXISTS public.maintenance_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  assigned_worker_id UUID REFERENCES public.workers(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'MEDIUM'
    CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'IN_PROGRESS', 'DONE')),
  due_at TIMESTAMPTZ,
  notes TEXT,
  created_by TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_client_status
  ON public.maintenance_tasks (client_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_worker_due
  ON public.maintenance_tasks (assigned_worker_id, due_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_client_due
  ON public.maintenance_tasks (client_id, due_at)
  WHERE deleted_at IS NULL;

ALTER TABLE public.maintenance_tasks ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY service_role_bypass ON public.maintenance_tasks
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS authenticated_tenant_maintenance_tasks ON public.maintenance_tasks;
CREATE POLICY authenticated_tenant_maintenance_tasks ON public.maintenance_tasks
  FOR ALL
  TO authenticated
  USING (client_id IS NOT NULL AND client_id IN (SELECT public.bamakor_my_client_ids()))
  WITH CHECK (client_id IS NOT NULL AND client_id IN (SELECT public.bamakor_my_client_ids()));

COMMENT ON TABLE public.maintenance_tasks IS
  'General maintenance tasks (not tickets). Manager assigns manually; workers update from portal.';

-- 3) Task attachments (reuse ticket-attachments storage bucket; path stored in file_url)
CREATE TABLE IF NOT EXISTS public.maintenance_task_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.maintenance_tasks(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  mime_type TEXT,
  uploaded_by_worker_id UUID REFERENCES public.workers(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_maintenance_task_attachments_task
  ON public.maintenance_task_attachments (task_id);

ALTER TABLE public.maintenance_task_attachments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY service_role_bypass ON public.maintenance_task_attachments
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS authenticated_tenant_maintenance_task_attachments ON public.maintenance_task_attachments;
CREATE POLICY authenticated_tenant_maintenance_task_attachments ON public.maintenance_task_attachments
  FOR ALL
  TO authenticated
  USING (client_id IS NOT NULL AND client_id IN (SELECT public.bamakor_my_client_ids()))
  WITH CHECK (client_id IS NOT NULL AND client_id IN (SELECT public.bamakor_my_client_ids()));

-- 4) Tour notes/photos enrichment
CREATE TABLE IF NOT EXISTS public.worker_site_tour_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id UUID NOT NULL REFERENCES public.worker_site_tours(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  mime_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_worker_site_tour_attachments_tour
  ON public.worker_site_tour_attachments (tour_id);

ALTER TABLE public.worker_site_tour_attachments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY service_role_bypass ON public.worker_site_tour_attachments
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.worker_site_tours
  ADD COLUMN IF NOT EXISTS defect_ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.worker_site_tours.defect_ticket_id IS
  'Optional ticket opened from a defect reported during this site tour.';
