-- Run BEFORE import — should return 0 rows.
-- Rename קוואדרה → מקור חיים first: data/rename-kvadrat-to-makor-chaim.sql
WITH pdf_map AS (
  SELECT * FROM (VALUES
    ('מקור חיים 40א', 'מקור חיים 40א'),
    ('מקור חיים 40ב', 'מקור חיים 40ב'),
    ('מקור חיים 37', 'מקור חיים 37'),
    ('מקור חיים 39', 'מקור חיים 39'),
    ('מקור חיים 41', 'מקור חיים 41'),
    ('מקור חיים 43', 'מקור חיים 43'),
    ('מקור חיים 12א', 'מקור חיים 12א'),
    ('אביטל 13א', 'אביטל 13א'),
    ('אביטל 13ב', 'אביטל 13ב'),
    ('דרך בית לחם 94', 'דרך בית לחם 94'),
    ('חלץ 10', 'חלץ 10'),
    ('חלץ 12', 'חלץ 12'),
    ('רות 3', 'רות 3'),
    ('אפרים 8', 'אפרים 8'),
    ('מנשה 8', 'מנשה 8'),
    ('ראובן 14', 'ראובן 14'),
    ('בוזגלו 4', 'בוזגלו 4'),
    ('מקור חיים 62', 'מקור חיים 62'),
    ('אלרואי 5א', 'אלרואי 5א'),
    ('אלרואי 5ג', 'אלרואי 5ג')
  ) AS t(pdf_name, match_norm)
),
db_norm AS (
  SELECT
    name,
    lower(trim(regexp_replace(regexp_replace(
      regexp_replace(trim(regexp_replace(name, '\s+', ' ', 'g')), '\s+([א-ת])$', '\1'),
      '([0-9])\s+([א-ת])', '\1\2', 'g'), '\s*-\s*', ' ', 'g'))) AS norm
  FROM projects
  WHERE client_id = '7573f5ad-70e5-4357-8fef-1d96ec38d169'::uuid AND is_active = true
)
SELECT p.pdf_name AS building_in_pdf_not_in_db
FROM pdf_map p
LEFT JOIN db_norm d ON d.norm = p.match_norm
WHERE d.norm IS NULL;
