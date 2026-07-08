-- למה ~688 שורות ולא ~500? — הסבר מספרים (שאילתה אחת)
-- client_id: 7573f5ad-70e5-4357-8fef-1d96ec38d169

SELECT
  COUNT(*) AS total_resident_rows,
  COUNT(*) FILTER (
    WHERE full_name IN ('דייר WhatsApp', 'דייר ללא שם')
  ) AS placeholder_rows,
  COUNT(*) FILTER (
    WHERE full_name NOT IN ('דייר WhatsApp', 'דייר ללא שם')
  ) AS real_directory_rows,
  COUNT(DISTINCT (r.project_id, lower(trim(coalesce(r.apartment_number, ''))))) FILTER (
    WHERE full_name NOT IN ('דייר WhatsApp', 'דייר ללא שם')
      AND apartment_number IS NOT NULL
      AND trim(apartment_number) ~ '^[0-9]+$'
  ) AS households_unique_building_apt,
  COUNT(*) FILTER (WHERE is_renter = true) AS renter_rows,
  COUNT(*) FILTER (WHERE is_renter = false) AS owner_occupant_rows
FROM residents r
WHERE r.client_id = '7573f5ad-70e5-4357-8fef-1d96ec38d169'::uuid
  AND r.deleted_at IS NULL;
