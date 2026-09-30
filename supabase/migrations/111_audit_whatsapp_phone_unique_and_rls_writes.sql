-- Audit remediation (findings 07, 15): schema hardening only — apply after review.
-- 15: WhatsApp phone_number_id must be unique when set (partial unique index).
-- 07: revoke direct table writes from authenticated on core tenant tables;
--     managers must mutate via API (service_role). SELECT policies remain.

-- Unique WhatsApp line per tenant (NULLs allowed / multiple NULLs OK in Postgres partial index).
CREATE UNIQUE INDEX IF NOT EXISTS clients_whatsapp_phone_number_id_uidx
  ON public.clients (whatsapp_phone_number_id)
  WHERE whatsapp_phone_number_id IS NOT NULL
    AND btrim(whatsapp_phone_number_id) <> '';

-- Harden: authenticated may read tenant rows via RLS, but not write directly.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tickets',
    'projects',
    'workers',
    'residents',
    'sessions',
    'maintenance_tasks',
    'collection_charges',
    'worker_attendance_events',
    'worker_attendance_shifts',
    'nfc_tags'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON TABLE public.%I FROM authenticated', t);
    END IF;
  END LOOP;
END $$;
