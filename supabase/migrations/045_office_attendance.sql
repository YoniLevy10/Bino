-- Office attendance: entrance QR station + staff time entries (hourly payroll).

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS office_attendance_station_token UUID;

UPDATE public.clients
SET office_attendance_station_token = gen_random_uuid()
WHERE office_attendance_station_token IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_office_attendance_station_token
  ON public.clients (office_attendance_station_token)
  WHERE office_attendance_station_token IS NOT NULL;

COMMENT ON COLUMN public.clients.office_attendance_station_token IS
  'Secret token in entrance QR URL (/attendance/scan?st=). Rotate if QR is compromised.';

CREATE TABLE IF NOT EXISTS public.office_staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  hourly_rate NUMERIC(10, 2),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_office_staff_client_active
  ON public.office_staff (client_id, is_active);

CREATE TABLE IF NOT EXISTS public.office_time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES public.office_staff(id) ON DELETE CASCADE,
  clock_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  clock_out_at TIMESTAMPTZ,
  clock_in_lat DOUBLE PRECISION,
  clock_in_lng DOUBLE PRECISION,
  clock_in_accuracy_m DOUBLE PRECISION,
  clock_out_lat DOUBLE PRECISION,
  clock_out_lng DOUBLE PRECISION,
  clock_out_accuracy_m DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_office_time_entries_one_open_shift
  ON public.office_time_entries (staff_id)
  WHERE clock_out_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_office_time_entries_client_clock_in
  ON public.office_time_entries (client_id, clock_in_at DESC);

CREATE INDEX IF NOT EXISTS idx_office_time_entries_staff_clock_in
  ON public.office_time_entries (staff_id, clock_in_at DESC);

ALTER TABLE public.office_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.office_time_entries ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY "service_role_bypass" ON public.office_staff
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY "service_role_bypass" ON public.office_time_entries
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DROP POLICY IF EXISTS authenticated_tenant_office_staff ON public.office_staff;
CREATE POLICY authenticated_tenant_office_staff ON public.office_staff
  FOR ALL
  TO authenticated
  USING (client_id IN (SELECT public.bamakor_my_client_ids()))
  WITH CHECK (client_id IN (SELECT public.bamakor_my_client_ids()));

DROP POLICY IF EXISTS authenticated_tenant_office_time_entries ON public.office_time_entries;
CREATE POLICY authenticated_tenant_office_time_entries ON public.office_time_entries
  FOR ALL
  TO authenticated
  USING (client_id IN (SELECT public.bamakor_my_client_ids()))
  WITH CHECK (client_id IN (SELECT public.bamakor_my_client_ids()));

COMMENT ON TABLE public.office_staff IS 'Office employees (hourly); separate from field workers table.';
COMMENT ON TABLE public.office_time_entries IS 'Clock in/out from entrance QR; optional GPS coordinates.';
