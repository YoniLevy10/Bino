-- Run BEFORE import-residents.sql — should return 0 rows.
WITH pdf_projects AS (
  SELECT unnest(ARRAY[
    'אביטל 13א', 'אביטל 13ב', 'אלרואי 5א', 'אלרואי 5ג', 'אפרים 8', 'בוזגלו 4',
    'דרך בית לחם 94', 'חלץ 10', 'חלץ 12', 'מנשה 8', 'מקור חיים 12א', 'מקור חיים 37',
    'מקור חיים 39', 'מקור חיים 40א', 'מקור חיים 40ב', 'מקור חיים 41', 'מקור חיים 43',
    'מקור חיים 62', 'ראובן 14', 'רות 3'
  ]) AS pdf_name
),
pdf_norm AS (
  SELECT
    pdf_name,
    lower(
      trim(
        regexp_replace(
          regexp_replace(
            regexp_replace(trim(regexp_replace(pdf_name, '\s+', ' ', 'g')), '\s+([א-ת])$', '\1'),
            '([0-9])\s+([א-ת])', '\1\2', 'g'
          ),
          '\s*-\s*', ' ', 'g'
        )
      )
    ) AS norm
  FROM pdf_projects
),
db_norm AS (
  SELECT
    name,
    lower(
      trim(
        regexp_replace(
          regexp_replace(
            regexp_replace(trim(regexp_replace(name, '\s+', ' ', 'g')), '\s+([א-ת])$', '\1'),
            '([0-9])\s+([א-ת])', '\1\2', 'g'
          ),
          '\s*-\s*', ' ', 'g'
        )
      )
    ) AS norm
  FROM projects
  WHERE client_id = '7573f5ad-70e5-4357-8fef-1d96ec38d169'::uuid
    AND is_active = true
)
SELECT p.pdf_name AS building_in_pdf_not_in_db
FROM pdf_norm p
LEFT JOIN db_norm d ON d.norm = p.norm
WHERE d.norm IS NULL;
