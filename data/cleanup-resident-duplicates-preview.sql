-- PREVIEW: כפילויות שיימחקו (שאילתה אחת)
-- client_id: 7573f5ad-70e5-4357-8fef-1d96ec38d169

WITH ranked AS (
  SELECT
    r.id,
    p.name AS building,
    r.apartment_number AS apt,
    r.full_name,
    r.phone,
    r.normalized_phone,
    r.created_at,
    ROW_NUMBER() OVER (
      PARTITION BY
        r.project_id,
        lower(trim(coalesce(r.apartment_number, ''))),
        lower(trim(r.full_name))
      ORDER BY
        (r.normalized_phone IS NOT NULL AND length(r.normalized_phone) >= 9) DESC,
        (r.phone IS NOT NULL AND trim(r.phone) <> '') DESC,
        (r.email IS NOT NULL AND trim(r.email) <> '') DESC,
        r.created_at ASC
    ) AS rn
  FROM residents r
  JOIN projects p ON p.id = r.project_id
  WHERE r.client_id = '7573f5ad-70e5-4357-8fef-1d96ec38d169'::uuid
    AND r.deleted_at IS NULL
    AND r.full_name NOT IN ('דייר WhatsApp', 'דייר ללא שם')
)
SELECT
  building,
  apt,
  full_name,
  phone,
  normalized_phone,
  id AS will_delete_id,
  created_at
FROM ranked
WHERE rn > 1
ORDER BY building, apt, full_name, created_at;
