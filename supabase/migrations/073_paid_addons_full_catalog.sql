-- Full paid add-ons catalog + calendar / project documents / pilot SMS infrastructure.

-- Office calendar
CREATE TABLE IF NOT EXISTS public.calendar_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  all_day BOOLEAN NOT NULL DEFAULT false,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_client_starts
  ON public.calendar_events (client_id, starts_at);

ALTER TABLE public.calendar_events
  ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT 'other';

DO $$
BEGIN
  ALTER TABLE public.calendar_events
    ADD CONSTRAINT calendar_events_event_type_check
    CHECK (event_type IN ('committee', 'professional', 'internal', 'other'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY service_role_bypass ON public.calendar_events
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS authenticated_tenant_calendar_events ON public.calendar_events;
CREATE POLICY authenticated_tenant_calendar_events ON public.calendar_events
  FOR ALL TO authenticated
  USING (client_id IN (SELECT public.bamakor_my_client_ids()))
  WITH CHECK (client_id IN (SELECT public.bamakor_my_client_ids()));

-- Project documents + pilot SMS log
CREATE TABLE IF NOT EXISTS public.project_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  file_size BIGINT,
  notes TEXT,
  uploaded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_documents_project
  ON public.project_documents (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_documents_client
  ON public.project_documents (client_id);

CREATE TABLE IF NOT EXISTS public.project_pilot_sms_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  sent_by UUID,
  recipients_total INT NOT NULL DEFAULT 0,
  sent_count INT NOT NULL DEFAULT 0,
  failed_count INT NOT NULL DEFAULT 0,
  skipped_no_phone INT NOT NULL DEFAULT 0,
  dry_run BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_pilot_sms_runs_project
  ON public.project_pilot_sms_runs (project_id, created_at DESC);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'project-documents',
  'project-documents',
  false,
  15728640,
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'application/zip'
  ]::text[]
)
ON CONFLICT (id) DO NOTHING;

-- Catalog rows (prices editable in Super Admin)
INSERT INTO public.paid_addons_catalog (addon_key, name_he, description_he, price_ils_monthly, sort_order)
VALUES
  (
    'calendar',
    'יומן משרד',
    'פגישות, ועדות ואירועים — תצוגת חודש, קישור לפרויקטים וייצוא ל-Google Calendar.',
    59,
    5
  ),
  (
    'pilot_sms',
    'SMS פיילוט לדיירים',
    'הודעת פתיחה רב-לשונית לכל דיירי הבניין עם המלצה לשמור את מוקד התקלות.',
    69,
    35
  ),
  (
    'project_documents',
    'תיקיית מסמכים',
    'ארכיון קבצים לכל פרויקט — חוזים, תוכניות ומסמכים עם הורדה מאובטחת.',
    39,
    40
  )
ON CONFLICT (addon_key) DO UPDATE SET
  name_he = EXCLUDED.name_he,
  description_he = EXCLUDED.description_he,
  sort_order = EXCLUDED.sort_order;

UPDATE public.paid_addons_catalog SET sort_order = 10 WHERE addon_key = 'professionals';
UPDATE public.paid_addons_catalog SET sort_order = 20 WHERE addon_key = 'worker_stamp';
