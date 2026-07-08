-- PREVIEW: כמה שורות יימחקו (שאילתה אחת)
-- client_id: 7573f5ad-70e5-4357-8fef-1d96ec38d169

WITH ranked AS (
  SELECT
    r.id,
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
  WHERE r.client_id = '7573f5ad-70e5-4357-8fef-1d96ec38d169'::uuid
    AND r.deleted_at IS NULL
    AND r.full_name NOT IN ('דייר WhatsApp', 'דייר ללא שם')
)
SELECT
  COUNT(*) FILTER (WHERE rn = 1) AS rows_to_keep,
  COUNT(*) FILTER (WHERE rn > 1) AS rows_to_soft_delete
FROM ranked;
