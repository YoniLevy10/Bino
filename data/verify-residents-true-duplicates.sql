-- כפילויות אמיתיות חשודות (שאילתה אחת) — אותו בניין+דירה+שם
-- client_id: 7573f5ad-70e5-4357-8fef-1d96ec38d169

SELECT
  p.name AS building,
  min(trim(r.apartment_number)) AS apt,
  min(trim(r.full_name)) AS full_name,
  COUNT(*) AS duplicate_rows,
  string_agg(r.id::text, ', ' ORDER BY r.created_at) AS resident_ids,
  string_agg(coalesce(r.phone, '—'), ' | ' ORDER BY r.created_at) AS phones
FROM residents r
JOIN projects p ON p.id = r.project_id
WHERE r.client_id = '7573f5ad-70e5-4357-8fef-1d96ec38d169'::uuid
  AND r.deleted_at IS NULL
  AND r.full_name NOT IN ('דייר WhatsApp', 'דייר ללא שם')
GROUP BY p.name, r.project_id, lower(trim(coalesce(r.apartment_number, ''))), lower(trim(r.full_name))
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC, p.name, min(trim(r.apartment_number));
