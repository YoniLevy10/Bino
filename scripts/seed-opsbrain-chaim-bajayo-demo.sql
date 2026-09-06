-- OpsBrain demo tenant seed
-- Client: 07773bb3-4969-4bce-8ce2-faab3b26383c
-- Org:    a281af3c-99b6-4a4a-a5ba-9498e05e984e
--
-- Reskins the OpsBrain account for sales demos (buildings/tickets/residents/workers).
-- Also seeds collections + worker stamp demo rows and enables those paid add-ons.
-- Login user (email/password) is created separately:
--   npx tsx scripts/ensure-opsbrain-demo-user.ts
-- Logo: upload via Superadmin UI (not seeded here).
--
-- Safe to re-run: deletes this client's demo rows first.

BEGIN;

DELETE FROM worker_attendance_events WHERE client_id = '07773bb3-4969-4bce-8ce2-faab3b26383c';
DELETE FROM worker_attendance WHERE client_id = '07773bb3-4969-4bce-8ce2-faab3b26383c';
DELETE FROM worker_nfc_tags WHERE client_id = '07773bb3-4969-4bce-8ce2-faab3b26383c';
DELETE FROM collection_charges WHERE client_id = '07773bb3-4969-4bce-8ce2-faab3b26383c';

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
    ARRAY['NEW','ASSIGNED','IN_PROGRESS','WAITING_PARTS','SITE_TOUR','CLOSED'] AS statuses,
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
  CASE WHEN params.statuses[1 + ((s.i - 1) % array_length(params.statuses, 1))] IN ('CLOSED')
       THEN now() - make_interval(hours => s.i * 2) ELSE NULL END
FROM series s
CROSS JOIN params
CROSS JOIN worker w
JOIN projects_n p ON p.rn = 1 + ((s.i - 1) % 16);

-- Enable sales-demo paid add-ons (collections + worker stamp)
INSERT INTO client_paid_addons (client_id, addon_key, enabled, enabled_at, notes)
VALUES
  ('07773bb3-4969-4bce-8ce2-faab3b26383c', 'collections', true, now(), 'OpsBrain sales demo'),
  ('07773bb3-4969-4bce-8ce2-faab3b26383c', 'worker_stamp', true, now(), 'OpsBrain sales demo')
ON CONFLICT (client_id, addon_key) DO UPDATE
SET enabled = true,
    enabled_at = EXCLUDED.enabled_at,
    notes = EXCLUDED.notes,
    updated_at = now();

-- Demo collection charges (mixed statuses) against first few residents
WITH r AS (
  SELECT id, project_id, row_number() OVER (ORDER BY full_name) AS rn
  FROM residents
  WHERE client_id = '07773bb3-4969-4bce-8ce2-faab3b26383c'
  LIMIT 8
)
INSERT INTO collection_charges (
  client_id, project_id, resident_id,
  title, description, amount, currency, status,
  period_label, sent_at, paid_at
)
SELECT
  '07773bb3-4969-4bce-8ce2-faab3b26383c'::uuid,
  r.project_id,
  r.id,
  CASE r.rn
    WHEN 1 THEN 'ועד בית — מרץ 2026'
    WHEN 2 THEN 'ועד בית — מרץ 2026'
    WHEN 3 THEN 'ועד בית — פברואר 2026'
    WHEN 4 THEN 'תיקון מעלית — השתתפות'
    WHEN 5 THEN 'ועד בית — ינואר 2026'
    WHEN 6 THEN 'ניקיון חניון — חד פעמי'
    WHEN 7 THEN 'ועד בית — מרץ 2026'
    ELSE 'ביטוח מבנה — רבעון'
  END,
  'חיוב דמו להצגת מסך גבייה',
  CASE r.rn
    WHEN 4 THEN 350.00
    WHEN 6 THEN 120.00
    WHEN 8 THEN 480.00
    ELSE 450.00
  END,
  'ILS',
  CASE r.rn
    WHEN 1 THEN 'paid'
    WHEN 2 THEN 'sent'
    WHEN 3 THEN 'paid'
    WHEN 4 THEN 'sent'
    WHEN 5 THEN 'draft'
    WHEN 6 THEN 'failed'
    WHEN 7 THEN 'sent'
    ELSE 'cancelled'
  END,
  'Q1-2026',
  CASE WHEN r.rn IN (5) THEN NULL ELSE now() - make_interval(days => r.rn) END,
  CASE WHEN r.rn IN (1, 3) THEN now() - make_interval(days => r.rn - 1) ELSE NULL END
FROM r;

-- Demo NFC tags: office + 2 project tags
INSERT INTO worker_nfc_tags (client_id, project_id, tag_code, tag_type, label, is_active)
SELECT
  '07773bb3-4969-4bce-8ce2-faab3b26383c'::uuid,
  NULL,
  'DEMO-OFFICE-HBJ',
  'office',
  'משרד — החתמת נוכחות',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM worker_nfc_tags
  WHERE client_id = '07773bb3-4969-4bce-8ce2-faab3b26383c' AND tag_code = 'DEMO-OFFICE-HBJ'
);

INSERT INTO worker_nfc_tags (client_id, project_id, tag_code, tag_type, label, is_active)
SELECT
  '07773bb3-4969-4bce-8ce2-faab3b26383c'::uuid,
  p.id,
  format('DEMO-SITE-%s', p.project_code),
  'project',
  format('אתר %s', p.name),
  true
FROM (
  SELECT id, name, project_code
  FROM projects
  WHERE client_id = '07773bb3-4969-4bce-8ce2-faab3b26383c'
  ORDER BY name
  LIMIT 2
) p
WHERE NOT EXISTS (
  SELECT 1 FROM worker_nfc_tags t
  WHERE t.client_id = '07773bb3-4969-4bce-8ce2-faab3b26383c'
    AND t.tag_code = format('DEMO-SITE-%s', p.project_code)
);

-- Closed attendance shift yesterday + open shift today (for first worker)
WITH w AS (
  SELECT id FROM workers
  WHERE client_id = '07773bb3-4969-4bce-8ce2-faab3b26383c'
  ORDER BY created_at
  LIMIT 1
),
office AS (
  SELECT id FROM worker_nfc_tags
  WHERE client_id = '07773bb3-4969-4bce-8ce2-faab3b26383c' AND tag_code = 'DEMO-OFFICE-HBJ'
  LIMIT 1
),
site AS (
  SELECT id, project_id FROM worker_nfc_tags
  WHERE client_id = '07773bb3-4969-4bce-8ce2-faab3b26383c' AND tag_type = 'project'
  ORDER BY tag_code
  LIMIT 1
),
ins_closed AS (
  INSERT INTO worker_attendance (
    client_id, worker_id, started_at, ended_at,
    start_tag_id, end_tag_id, start_source, end_source,
    total_minutes, status
  )
  SELECT
    '07773bb3-4969-4bce-8ce2-faab3b26383c'::uuid,
    w.id,
    date_trunc('day', now()) - interval '1 day' + interval '8 hours',
    date_trunc('day', now()) - interval '1 day' + interval '16 hours 30 minutes',
    office.id,
    office.id,
    'online',
    'online',
    510,
    'closed'
  FROM w, office
  RETURNING id, worker_id
),
ins_open AS (
  INSERT INTO worker_attendance (
    client_id, worker_id, started_at,
    start_tag_id, start_source, status
  )
  SELECT
    '07773bb3-4969-4bce-8ce2-faab3b26383c'::uuid,
    w.id,
    date_trunc('day', now()) + interval '8 hours',
    office.id,
    'online',
    'open'
  FROM w, office
  RETURNING id, worker_id
)
INSERT INTO worker_attendance_events (
  client_id, worker_id, project_id, tag_id, tag_code,
  event_type, client_action_id, client_recorded_at, source, sync_status
)
SELECT
  '07773bb3-4969-4bce-8ce2-faab3b26383c'::uuid,
  w.id,
  NULL,
  office.id,
  'DEMO-OFFICE-HBJ',
  'clock_in',
  'demo-clock-in-yesterday',
  date_trunc('day', now()) - interval '1 day' + interval '8 hours',
  'online',
  'synced'
FROM w, office
UNION ALL
SELECT
  '07773bb3-4969-4bce-8ce2-faab3b26383c'::uuid,
  w.id,
  site.project_id,
  site.id,
  (SELECT tag_code FROM worker_nfc_tags WHERE id = site.id),
  'project_visit',
  'demo-site-visit-yesterday',
  date_trunc('day', now()) - interval '1 day' + interval '10 hours',
  'online',
  'synced'
FROM w, site
UNION ALL
SELECT
  '07773bb3-4969-4bce-8ce2-faab3b26383c'::uuid,
  w.id,
  NULL,
  office.id,
  'DEMO-OFFICE-HBJ',
  'clock_out',
  'demo-clock-out-yesterday',
  date_trunc('day', now()) - interval '1 day' + interval '16 hours 30 minutes',
  'online',
  'synced'
FROM w, office
UNION ALL
SELECT
  '07773bb3-4969-4bce-8ce2-faab3b26383c'::uuid,
  w.id,
  NULL,
  office.id,
  'DEMO-OFFICE-HBJ',
  'clock_in',
  'demo-clock-in-today',
  date_trunc('day', now()) + interval '8 hours',
  'online',
  'synced'
FROM w, office;

COMMIT;
