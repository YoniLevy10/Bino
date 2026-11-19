-- OpsBrain / סביון — demo WhatsApp inbox threads
-- Client: 07773bb3-4969-4bce-8ce2-faab3b26383c
-- Tag: wa_message_id like 'demo_wa_inbox_%' for safe re-run cleanup.
-- Safe to re-run.

BEGIN;

DELETE FROM whatsapp_messages
WHERE client_id = '07773bb3-4969-4bce-8ce2-faab3b26383c'
  AND wa_message_id LIKE 'demo_wa_inbox_%';

DELETE FROM whatsapp_conversations wc
WHERE wc.client_id = '07773bb3-4969-4bce-8ce2-faab3b26383c'
  AND wc.phone IN (
    '972500000101',
    '972500000103',
    '972500000105',
    '972500000107',
    '972500000109',
    '972500000111'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM whatsapp_messages wm
    WHERE wm.conversation_id = wc.id
  );

INSERT INTO client_paid_addons (client_id, addon_key, enabled, enabled_at, notes)
VALUES (
  '07773bb3-4969-4bce-8ce2-faab3b26383c',
  'whatsapp_inbox',
  true,
  now(),
  'OpsBrain WhatsApp inbox demo'
)
ON CONFLICT (client_id, addon_key) DO UPDATE
SET enabled = true,
    enabled_at = EXCLUDED.enabled_at,
    notes = EXCLUDED.notes,
    updated_at = now();

WITH target_phones AS (
  SELECT * FROM (
    VALUES
      ('972500000101'::text),
      ('972500000103'),
      ('972500000105'),
      ('972500000107'),
      ('972500000109'),
      ('972500000111')
  ) AS t(phone)
),
residents AS (
  SELECT
    tp.phone,
    r.id AS resident_id
  FROM target_phones tp
  LEFT JOIN public.residents r
    ON r.client_id = '07773bb3-4969-4bce-8ce2-faab3b26383c'
   AND r.normalized_phone = tp.phone
   AND r.deleted_at IS NULL
),
thread_meta AS (
  SELECT * FROM (
    VALUES
      ('972500000101'::text, now() - interval '12 minutes', 'תודה רבה, מחכים לטכנאי'::text),
      ('972500000103', now() - interval '45 minutes', 'המים עדיין מטפטפים ליד הדלת'),
      ('972500000105', now() - interval '2 hours', 'השער נפתח — תודה!'),
      ('972500000107', now() - interval '5 hours', 'אוקיי, נעדכן אם זה חוזר'),
      ('972500000109', now() - interval '1 day', 'קיבלתי את הקישור לתשלום'),
      ('972500000111', now() - interval '2 days', 'מתי מגיעים לגזום?')
  ) AS t(phone, last_at, preview)
),
ins_conv AS (
  INSERT INTO whatsapp_conversations (
    id, client_id, phone, resident_id, last_message_at, last_message_preview, created_at, updated_at
  )
  SELECT
    gen_random_uuid(),
    '07773bb3-4969-4bce-8ce2-faab3b26383c'::uuid,
    r.phone,
    r.resident_id,
    tm.last_at,
    tm.preview,
    now() - interval '3 days',
    now()
  FROM residents r
  JOIN thread_meta tm ON tm.phone = r.phone
  RETURNING id, phone
),
msgs AS (
  SELECT * FROM (
    VALUES
      -- כהן · מעלית
      ('972500000101', 1, 'in',  'שלום, המעלית תקועה בקומה 3 כבר רבע שעה', 'text', now() - interval '55 minutes'),
      ('972500000101', 2, 'out', 'קיבלנו, פותחים קריאה ומשבצים טכנאי עכשיו', 'text', now() - interval '50 minutes'),
      ('972500000101', 3, 'out', 'יוסי בדרך — אמור להגיע תוך 20 דקות', 'text', now() - interval '35 minutes'),
      ('972500000101', 4, 'in',  'תודה רבה, מחכים לטכנאי', 'text', now() - interval '12 minutes'),

      -- מזרחי · נזילה
      ('972500000103', 1, 'in',  'יש נזילה מהתקרה בחדר המדרגות ליד דירה 3', 'text', now() - interval '3 hours'),
      ('972500000103', 2, 'out', 'תודה על הדיווח. שלחנו עובד לבדיקה', 'text', now() - interval '2 hours 40 minutes'),
      ('972500000103', 3, 'in',  'המים עדיין מטפטפים ליד הדלת', 'text', now() - interval '45 minutes'),

      -- אברהם · שער חניה
      ('972500000105', 1, 'in',  'שער החניה לא נסגר מאז הבוקר', 'text', now() - interval '5 hours'),
      ('972500000105', 2, 'out', 'קיבלנו — בודקים את המנוע והחיישן', 'text', now() - interval '4 hours 30 minutes'),
      ('972500000105', 3, 'out', 'תוקן. תנסו לפתוח/לסגור ותאשרו', 'text', now() - interval '2 hours 20 minutes'),
      ('972500000105', 4, 'in',  'השער נפתח — תודה!', 'text', now() - interval '2 hours'),

      -- גולן · רעש / מעקב
      ('972500000107', 1, 'in',  'יש רעש חזק מהמשאבה בלילה, אפשר לבדוק?', 'text', now() - interval '1 day'),
      ('972500000107', 2, 'out', 'רשמנו. נבדוק את המשאבה הבוקר ונעדכן', 'text', now() - interval '22 hours'),
      ('972500000107', 3, 'out', 'החלפנו מיסב — אמור להיות שקט יותר הלילה', 'text', now() - interval '6 hours'),
      ('972500000107', 4, 'in',  'אוקיי, נעדכן אם זה חוזר', 'text', now() - interval '5 hours'),

      -- חדד · גבייה
      ('972500000109', 1, 'out', 'שלום, נשלח קישור לתשלום ועד בית לחודש נובמבר', 'text', now() - interval '1 day 3 hours'),
      ('972500000109', 2, 'in',  'קיבלתי את הקישור לתשלום', 'text', now() - interval '1 day'),

      -- ביטון · גינון
      ('972500000111', 1, 'in',  'השיחים בכניסה חוסמים את השלט, אפשר לגזום?', 'text', now() - interval '2 days 2 hours'),
      ('972500000111', 2, 'out', 'כן, נתאם גינון השבוע', 'text', now() - interval '2 days'),
      ('972500000111', 3, 'in',  'מתי מגיעים לגזום?', 'text', now() - interval '2 days')
  ) AS m(phone, seq, direction, body, message_type, created_at)
),
ins_msgs AS (
  INSERT INTO whatsapp_messages (
    conversation_id,
    client_id,
    direction,
    wa_message_id,
    body,
    message_type,
    status,
    created_at
  )
  SELECT
    ic.id,
    '07773bb3-4969-4bce-8ce2-faab3b26383c'::uuid,
    m.direction,
    format('demo_wa_inbox_%s_%s', right(m.phone, 4), m.seq),
    m.body,
    m.message_type,
    'sent',
    m.created_at
  FROM msgs m
  JOIN ins_conv ic ON ic.phone = m.phone
  RETURNING id
)
SELECT count(*)::int AS inserted_messages FROM ins_msgs;

COMMIT;
