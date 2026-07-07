-- Run in Supabase SQL Editor BEFORE import-residents.sql if import fails on duplicate phone.
-- Same as migration 084_resident_phone_per_apartment.sql (safe to re-run).

DROP INDEX IF EXISTS idx_residents_client_phone_unique;
DROP INDEX IF EXISTS idx_residents_project_normalized_phone_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_residents_project_phone_apt_unique
ON residents (client_id, project_id, normalized_phone, lower(trim(apartment_number)))
WHERE normalized_phone IS NOT NULL
  AND apartment_number IS NOT NULL
  AND trim(apartment_number) <> ''
  AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_residents_project_phone_no_apt_unique
ON residents (client_id, project_id, normalized_phone)
WHERE normalized_phone IS NOT NULL
  AND (apartment_number IS NULL OR trim(apartment_number) = '')
  AND deleted_at IS NULL;
