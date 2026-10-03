-- Complementary to 111_audit_whatsapp_phone_unique_and_rls_writes.sql
-- Bamakor has worker_nfc_tags (not nfc_tags). Apply ONLY after review with
-- docs/MIGRATION_APPLY_PACKAGE_111_112_113.md — do not auto-apply to production.
--
-- Also revoke anon if previously granted (hardening parity with 111 intent).

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'worker_nfc_tags',
    'worker_attendance'
  ]
  LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON TABLE public.%I FROM authenticated', t);
      EXECUTE format('REVOKE INSERT, UPDATE, DELETE ON TABLE public.%I FROM anon', t);
    END IF;
  END LOOP;
END $$;
