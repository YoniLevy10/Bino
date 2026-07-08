-- דירות עם יותר מדייר אחד (בן/בת זוג + שוכרים — תקין ב-PDF)
-- client_id: 7573f5ad-70e5-4357-8fef-1d96ec38d169

SELECT
  p.name AS building,
  min(trim(r.apartment_number)) AS apt,
  COUNT(*) AS people_in_apt,
  string_agg(
    r.full_name || CASE WHEN r.is_renter THEN ' (ש)' ELSE '' END,
    ' | '
    ORDER BY r.full_name
  ) AS names
FROM residents r
JOIN projects p ON p.id = r.project_id
WHERE r.client_id = '7573f5ad-70e5-4357-8fef-1d96ec38d169'::uuid
  AND r.deleted_at IS NULL
  AND r.full_name NOT IN ('דייר WhatsApp', 'דייר ללא שם')
  AND r.apartment_number IS NOT NULL
  AND trim(r.apartment_number) ~ '^[0-9]+$'
GROUP BY p.name, r.project_id, lower(trim(r.apartment_number))
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC, p.name, min(trim(r.apartment_number));
