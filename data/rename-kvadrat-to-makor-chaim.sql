-- Rename קוואדרה projects → מקור חיים (street name — used in WhatsApp building search).
-- Run ONCE in Supabase SQL Editor BEFORE import-residents.sql.
-- Review SELECT at bottom first; then uncomment UPDATE block.

-- Preview current קוואדרה projects:
SELECT id, name, project_code, address
FROM projects
WHERE client_id = '7573f5ad-70e5-4357-8fef-1d96ec38d169'::uuid
  AND is_active = true
  AND (name ILIKE '%קוואדרה%' OR name ILIKE '%מקור חיים%')
ORDER BY name;

BEGIN;

UPDATE projects
SET
  name = v.new_name,
  address = CASE
    WHEN address IS NULL OR trim(address) = '' OR address ILIKE '%קוואדרה%'
      THEN v.new_name
    ELSE address
  END
FROM (VALUES
  ('קוואדרה- קוואדרה 37', 'מקור חיים 37'),
  ('קוואדרה- קוואדרה 39', 'מקור חיים 39'),
  ('קוואדרה- קוואדרה 41', 'מקור חיים 41'),
  ('קוואדרה- קוואדרה 43', 'מקור חיים 43'),
  ('קוואדרה 37', 'מקור חיים 37'),
  ('קוואדרה 39', 'מקור חיים 39'),
  ('קוואדרה 41', 'מקור חיים 41'),
  ('קוואדרה 43', 'מקור חיים 43')
) AS v(old_name, new_name)
WHERE projects.client_id = '7573f5ad-70e5-4357-8fef-1d96ec38d169'::uuid
  AND projects.is_active = true
  AND projects.name = v.old_name;

COMMIT;

-- After rename — should show מקור חיים 37/39/41/43:
SELECT id, name, project_code, address
FROM projects
WHERE client_id = '7573f5ad-70e5-4357-8fef-1d96ec38d169'::uuid
  AND is_active = true
  AND name ILIKE '%מקור חיים%'
ORDER BY name;
