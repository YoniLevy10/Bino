-- מחק כפילויות: אותו בניין + דירה + שם (שומר שורה אחת — הטלפון הכי טוב)
-- client_id: 7573f5ad-70e5-4357-8fef-1d96ec38d169
-- הרץ פעם אחת ב-Supabase SQL Editor

BEGIN;

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
),
to_remove AS (
  SELECT id FROM ranked WHERE rn > 1
)
UPDATE residents r
SET
  deleted_at = NOW(),
  updated_at = NOW()
FROM to_remove t
WHERE r.id = t.id
  AND r.client_id = '7573f5ad-70e5-4357-8fef-1d96ec38d169'::uuid
  AND r.deleted_at IS NULL;

COMMIT;
