-- Run in Supabase SQL Editor after import.
-- client_id: Bamakor (7573f5ad-70e5-4357-8fef-1d96ec38d169)

-- ── 1) סה"כ דיירים פעילים ───────────────────────────────────────────────────
SELECT COUNT(*) AS total_active_residents
FROM residents
WHERE client_id = '7573f5ad-70e5-4357-8fef-1d96ec38d169'::uuid
  AND deleted_at IS NULL;

-- ── 2) לפי בניין ───────────────────────────────────────────────────────────
SELECT p.name AS building, COUNT(r.id) AS residents
FROM projects p
LEFT JOIN residents r
  ON r.project_id = p.id
  AND r.deleted_at IS NULL
WHERE p.client_id = '7573f5ad-70e5-4357-8fef-1d96ec38d169'::uuid
  AND p.is_active = true
GROUP BY p.name
ORDER BY p.name;

-- ── 3) צפוי ~532 מה-PDF (אם הייבוא הושלם) ───────────────────────────────────
SELECT
  COUNT(*) AS imported_rows,
  COUNT(DISTINCT normalized_phone) FILTER (WHERE normalized_phone IS NOT NULL) AS unique_phones,
  COUNT(*) FILTER (WHERE is_renter = true) AS renters
FROM residents
WHERE client_id = '7573f5ad-70e5-4357-8fef-1d96ec38d169'::uuid
  AND deleted_at IS NULL
  AND full_name NOT IN ('דייר ללא שם', 'דייר WhatsApp');

-- ── 4) אותו טלפון בכמה דירות (תקין אחרי תיקון המגבלה) ───────────────────────
SELECT
  normalized_phone,
  COUNT(*) AS apartment_rows,
  string_agg(DISTINCT p.name || ' דירה ' || COALESCE(r.apartment_number, '?'), ' | ' ORDER BY 1) AS locations
FROM residents r
JOIN projects p ON p.id = r.project_id
WHERE r.client_id = '7573f5ad-70e5-4357-8fef-1d96ec38d169'::uuid
  AND r.deleted_at IS NULL
  AND r.normalized_phone IS NOT NULL
GROUP BY r.normalized_phone
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC
LIMIT 20;

-- ── 5) בניינים מה-PDF בלי דיירים (אמור להיות ריק אחרי ייבוא מוצלח) ─────────
WITH pdf_buildings AS (
  SELECT unnest(ARRAY[
    'אביטל 13א', 'אביטל 13ב', 'אלרואי 5א', 'אלרואי 5ג', 'אפרים 8', 'בוזגלו 4',
    'דרך בית לחם 94', 'חלץ 10', 'חלץ 12', 'מנשה 8',
    'מקור חיים 12א', 'מקור חיים 37', 'מקור חיים 39', 'מקור חיים 40א', 'מקור חיים 40ב',
    'מקור חיים 41', 'מקור חיים 43', 'מקור חיים 62', 'ראובן 14', 'רות 3'
  ]) AS pdf_name
)
SELECT pb.pdf_name
FROM pdf_buildings pb
LEFT JOIN projects p
  ON p.client_id = '7573f5ad-70e5-4357-8fef-1d96ec38d169'::uuid
  AND p.is_active = true
  AND trim(p.name) = pb.pdf_name
LEFT JOIN residents r ON r.project_id = p.id AND r.deleted_at IS NULL
WHERE p.id IS NULL OR r.id IS NULL
GROUP BY pb.pdf_name, p.id
HAVING p.id IS NULL OR COUNT(r.id) = 0;
