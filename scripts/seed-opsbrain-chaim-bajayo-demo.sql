-- OpsBrain demo tenant seed (opsbrain1@gmail.com)
-- Client: 07773bb3-4969-4bce-8ce2-faab3b26383c
-- Replaces "אסף עו״ד" with חיים בג'איו 1א–8ב (16 buildings) + demo tickets/residents/workers.
-- Logo: upload via Superadmin UI (not seeded here).
--
-- Safe to re-run: deletes this client's projects/tickets/residents/workers first.

BEGIN;

DELETE FROM ticket_internal_messages
WHERE ticket_id IN (SELECT id FROM tickets WHERE client_id = '07773bb3-4969-4bce-8ce2-faab3b26383c');
DELETE FROM ticket_logs
WHERE ticket_id IN (SELECT id FROM tickets WHERE client_id = '07773bb3-4969-4bce-8ce2-faab3b26383c');
DELETE FROM ticket_attachments
WHERE ticket_id IN (SELECT id FROM tickets WHERE client_id = '07773bb3-4969-4bce-8ce2-faab3b26383c');
DELETE FROM tickets WHERE client_id = '07773bb3-4969-4bce-8ce2-faab3b26383c';
DELETE FROM pending_resident_join_requests WHERE client_id = '07773bb3-4969-4bce-8ce2-faab3b26383c';
DELETE FROM sessions WHERE client_id = '07773bb3-4969-4bce-8ce2-faab3b26383c';
DELETE FROM residents WHERE client_id = '07773bb3-4969-4bce-8ce2-faab3b26383c';
DELETE FROM worker_site_tours WHERE client_id = '07773bb3-4969-4bce-8ce2-faab3b26383c';
DELETE FROM projects WHERE client_id = '07773bb3-4969-4bce-8ce2-faab3b26383c';
DELETE FROM workers WHERE client_id = '07773bb3-4969-4bce-8ce2-faab3b26383c';

UPDATE clients SET
  name = 'חיים בג''איו',
  company_name = 'חיים בג''איו',
  display_name = 'חיים בג''איו',
  contact_name = 'OpsBrain Demo',
  plan = 'pro',
  plan_tier = 'pro',
  max_buildings = 20,
  buildings_allowed = 20
WHERE id = '07773bb3-4969-4bce-8ce2-faab3b26383c';

UPDATE organizations
SET name = 'חיים בג''איו', slug = 'chaim-bajayo'
WHERE id = 'a281af3c-99b6-4a4a-a5ba-9498e05e984e';

INSERT INTO workers (client_id, organization_id, full_name, name, phone, role, is_active)
VALUES
  ('07773bb3-4969-4bce-8ce2-faab3b26383c', 'a281af3c-99b6-4a4a-a5ba-9498e05e984e', 'יוסי תחזוקה', 'יוסי תחזוקה', '0509991122', 'טכנאי', true),
  ('07773bb3-4969-4bce-8ce2-faab3b26383c', 'a281af3c-99b6-4a4a-a5ba-9498e05e984e', 'אבי שירות', 'אבי שירות', '0509993344', 'טכנאי', true);

INSERT INTO projects (client_id, organization_id, name, project_code, address, address_en, qr_identifier, is_active)
SELECT
  '07773bb3-4969-4bce-8ce2-faab3b26383c'::uuid,
  'a281af3c-99b6-4a4a-a5ba-9498e05e984e'::uuid,
  format('חיים בג''איו %s%s', n, s),
  format('HBJ%s%s', n, CASE WHEN s = 'א' THEN 'A' ELSE 'B' END),
  format('חיים בג''איו %s%s, תל אביב', n, s),
  format('Haim Bajayo %s%s, Tel Aviv', n, CASE WHEN s = 'א' THEN 'A' ELSE 'B' END),
  format('START_HBJ%s%s', n, CASE WHEN s = 'א' THEN 'A' ELSE 'B' END),
  true
FROM generate_series(1, 8) AS n
CROSS JOIN (VALUES ('א'), ('ב')) AS suffixes(s);

-- 2 residents per building
WITH numbered AS (
  SELECT id, name, row_number() OVER (ORDER BY name) AS rn
  FROM projects
  WHERE client_id = '07773bb3-4969-4bce-8ce2-faab3b26383c'
)
INSERT INTO residents (client_id, project_id, full_name, phone, normalized_phone, apartment_number)
SELECT
  '07773bb3-4969-4bce-8ce2-faab3b26383c'::uuid,
  n.id,
  format('דייר %s דירה %s', n.name, apt),
  format('0527%s%s', lpad(n.rn::text, 2, '0'), lpad(apt::text, 2, '0')),
  format('972527%s%s', lpad(n.rn::text, 2, '0'), lpad(apt::text, 2, '0')),
  apt::text
FROM numbered n
CROSS JOIN (VALUES (1), (5)) AS a(apt);

-- 32 tickets (2 per building), mixed statuses
WITH projects_n AS (
  SELECT id, row_number() OVER (ORDER BY name) AS rn
  FROM projects WHERE client_id = '07773bb3-4969-4bce-8ce2-faab3b26383c'
),
worker AS (
  SELECT id FROM workers
  WHERE client_id = '07773bb3-4969-4bce-8ce2-faab3b26383c'
  ORDER BY created_at
  LIMIT 1
),
params AS (
  SELECT
    ARRAY[
      'נזילה מהתקרה בחדר המדרגות',
      'תקלה במעלית — נתקעת בין קומות',
      'דוד שמש לא מחמם מים',
      'ריח ביוב בחניון',
      'תאורת לובי כבויה',
      'דלת כניסה לא נסגרת היטב',
      'רעש חזק ממשאבת המים',
      'סתימה בביוב בחצר',
      'מזגן חדר כושר לא עובד',
      'שבר במדרגות הכניסה',
      'מים עומדים בחניון תת-קרקעי',
      'אינטרקום לא מצלצל לדירות',
      'גדר שבורה ליד השער',
      'חשמל בלוח קומה 2 נופל',
      'ניקיון ירוד בחדר האשפה',
      'ברז שותת בחדר האשפה'
    ] AS descs,
    ARRAY['דני כהן','יעל לוי','משה אברהם','רונית שמעון','אבי גולן','נועה פרץ','אלירן מזרחי','שירה בן דוד'] AS reporters,
    ARRAY['0501234001','0501234002','0501234003','0501234004','0501234005','0501234006','0501234007','0501234008'] AS phones,
    ARRAY['NEW','ASSIGNED','IN_PROGRESS','WAITING','DONE','CLOSED'] AS statuses,
    ARRAY['LOW','MEDIUM','HIGH','URGENT'] AS priorities
),
series AS (
  SELECT generate_series(1, 32) AS i
)
INSERT INTO tickets (
  client_id, organization_id, project_id,
  reporter_phone, reporter_name, description,
  status, priority, source, language,
  assigned_worker_id, opened_at, created_at, updated_at, closed_at
)
SELECT
  '07773bb3-4969-4bce-8ce2-faab3b26383c'::uuid,
  'a281af3c-99b6-4a4a-a5ba-9498e05e984e'::uuid,
  p.id,
  params.phones[1 + ((s.i - 1) % array_length(params.phones, 1))],
  params.reporters[1 + ((s.i - 1) % array_length(params.reporters, 1))],
  params.descs[1 + ((s.i - 1) % array_length(params.descs, 1))],
  params.statuses[1 + ((s.i - 1) % array_length(params.statuses, 1))],
  params.priorities[1 + ((s.i - 1) % array_length(params.priorities, 1))],
  'whatsapp',
  'he',
  CASE WHEN s.i % 3 = 0 THEN NULL ELSE w.id END,
  now() - make_interval(hours => s.i * 7),
  now() - make_interval(hours => s.i * 7),
  now() - make_interval(hours => s.i * 3),
  CASE WHEN params.statuses[1 + ((s.i - 1) % array_length(params.statuses, 1))] IN ('DONE','CLOSED')
       THEN now() - make_interval(hours => s.i * 2) ELSE NULL END
FROM series s
CROSS JOIN params
CROSS JOIN worker w
JOIN projects_n p ON p.rn = 1 + ((s.i - 1) % 16);

COMMIT;
