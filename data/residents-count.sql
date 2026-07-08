-- כמה דיירים פעילים (שאילתה אחת)
-- client_id: Bamakor

SELECT
  COUNT(*) AS total_active,
  COUNT(*) FILTER (WHERE full_name NOT IN ('דייר WhatsApp', 'דייר ללא שם')) AS directory_rows,
  COUNT(DISTINCT (project_id, lower(trim(coalesce(apartment_number, ''))))) FILTER (
    WHERE apartment_number IS NOT NULL AND trim(apartment_number) ~ '^[0-9]+$'
  ) AS unique_apartments
FROM residents
WHERE client_id = '7573f5ad-70e5-4357-8fef-1d96ec38d169'::uuid
  AND deleted_at IS NULL;
