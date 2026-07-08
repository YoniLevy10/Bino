-- שורות מלוכלכות מה-PDF (שם=טלפון, דירה לא מספרית)
-- client_id: 7573f5ad-70e5-4357-8fef-1d96ec38d169

SELECT
  p.name AS building,
  r.apartment_number AS apt,
  r.full_name,
  r.phone,
  r.is_renter,
  r.id
FROM residents r
JOIN projects p ON p.id = r.project_id
WHERE r.client_id = '7573f5ad-70e5-4357-8fef-1d96ec38d169'::uuid
  AND r.deleted_at IS NULL
  AND r.full_name NOT IN ('דייר WhatsApp', 'דייר ללא שם')
  AND (
    r.apartment_number IS NULL
    OR trim(r.apartment_number) !~ '^[0-9]+$'
    OR r.full_name ~ '^[0-9+()\\s-]+$'
    OR length(regexp_replace(coalesce(r.normalized_phone, ''), '\\D', '', 'g')) < 9
      AND r.full_name ~ '^[0-9+()\\s-]+$'
  )
ORDER BY p.name, r.apartment_number, r.full_name;
