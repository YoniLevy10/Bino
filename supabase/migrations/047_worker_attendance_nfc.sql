-- Worker NFC/QR attendance: tags, events, shifts (multi-tenant via client_id)

CREATE TABLE IF NOT EXISTS public.worker_nfc_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects (id) ON DELETE SET NULL,
  tag_code text NOT NULL,
  tag_type text NOT NULL CHECK (tag_type IN ('office', 'project')),
  label text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT worker_nfc_tags_client_tag_code_unique UNIQUE (client_id, tag_code)
);

CREATE INDEX IF NOT EXISTS idx_worker_nfc_tags_client_id ON public.worker_nfc_tags (client_id);
CREATE INDEX IF NOT EXISTS idx_worker_nfc_tags_project_id ON public.worker_nfc_tags (project_id);

COMMENT ON TABLE public.worker_nfc_tags IS 'NFC/QR tags for office clock and project visits';

CREATE TABLE IF NOT EXISTS public.worker_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES public.workers (id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  start_tag_id uuid REFERENCES public.worker_nfc_tags (id) ON DELETE SET NULL,
  end_tag_id uuid REFERENCES public.worker_nfc_tags (id) ON DELETE SET NULL,
  start_source text NOT NULL DEFAULT 'online' CHECK (start_source IN ('online', 'offline')),
  end_source text CHECK (end_source IN ('online', 'offline')),
  total_minutes integer,
  status text NOT NULL DEFAULT 'open' CHECK (
    status IN ('open', 'closed', 'missing_checkout', 'edited', 'pending_review')
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  edited_by uuid,
  edited_at timestamptz,
  admin_note text
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_worker_attendance_one_open_shift
  ON public.worker_attendance (client_id, worker_id)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_worker_attendance_client_id ON public.worker_attendance (client_id);
CREATE INDEX IF NOT EXISTS idx_worker_attendance_worker_id ON public.worker_attendance (worker_id);
CREATE INDEX IF NOT EXISTS idx_worker_attendance_started_at ON public.worker_attendance (started_at);
CREATE INDEX IF NOT EXISTS idx_worker_attendance_status ON public.worker_attendance (status);

CREATE TABLE IF NOT EXISTS public.worker_attendance_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES public.workers (id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects (id) ON DELETE SET NULL,
  tag_id uuid REFERENCES public.worker_nfc_tags (id) ON DELETE SET NULL,
  tag_code text,
  event_type text NOT NULL CHECK (
    event_type IN ('clock_in', 'clock_out', 'project_arrival', 'project_departure', 'project_visit')
  ),
  client_action_id text NOT NULL UNIQUE,
  client_recorded_at timestamptz NOT NULL,
  server_received_at timestamptz NOT NULL DEFAULT now(),
  client_timezone text,
  device_id text,
  user_agent text,
  lat double precision,
  lng double precision,
  note text,
  source text NOT NULL CHECK (source IN ('online', 'offline')),
  sync_status text NOT NULL DEFAULT 'synced' CHECK (
    sync_status IN ('synced', 'pending_review', 'conflict', 'rejected')
  ),
  sync_delay_minutes integer,
  suspicious_reason text,
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_worker_attendance_events_client_id ON public.worker_attendance_events (client_id);
CREATE INDEX IF NOT EXISTS idx_worker_attendance_events_worker_id ON public.worker_attendance_events (worker_id);
CREATE INDEX IF NOT EXISTS idx_worker_attendance_events_project_id ON public.worker_attendance_events (project_id);
CREATE INDEX IF NOT EXISTS idx_worker_attendance_events_tag_code ON public.worker_attendance_events (tag_code);
CREATE INDEX IF NOT EXISTS idx_worker_attendance_events_client_recorded_at ON public.worker_attendance_events (client_recorded_at);
CREATE INDEX IF NOT EXISTS idx_worker_attendance_events_sync_status ON public.worker_attendance_events (sync_status);

ALTER TABLE public.worker_nfc_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_attendance_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS authenticated_tenant_worker_nfc_tags ON public.worker_nfc_tags;
CREATE POLICY authenticated_tenant_worker_nfc_tags ON public.worker_nfc_tags
  FOR ALL TO authenticated
  USING (client_id IN (SELECT public.bamakor_my_client_ids()))
  WITH CHECK (client_id IN (SELECT public.bamakor_my_client_ids()));

DROP POLICY IF EXISTS authenticated_tenant_worker_attendance ON public.worker_attendance;
CREATE POLICY authenticated_tenant_worker_attendance ON public.worker_attendance
  FOR ALL TO authenticated
  USING (client_id IN (SELECT public.bamakor_my_client_ids()))
  WITH CHECK (client_id IN (SELECT public.bamakor_my_client_ids()));

DROP POLICY IF EXISTS authenticated_tenant_worker_attendance_events ON public.worker_attendance_events;
CREATE POLICY authenticated_tenant_worker_attendance_events ON public.worker_attendance_events
  FOR ALL TO authenticated
  USING (client_id IN (SELECT public.bamakor_my_client_ids()))
  WITH CHECK (client_id IN (SELECT public.bamakor_my_client_ids()));
