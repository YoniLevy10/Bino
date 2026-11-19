-- Demo seed for Savion sales demo — fills /tasks tabs (morning/open/today/week/all),
-- week board, assets, costs, checklist, KPI without-manager.
-- Tag: notes contain [DEMO_TASKS_PREMIUM] for safe re-run cleanup.
-- Client: סביון 07773bb3-4969-4bce-8ce2-faab3b26383c

BEGIN;

-- Cleanup prior premium demo rows
UPDATE public.maintenance_tasks
SET deleted_at = now(), updated_at = now()
WHERE client_id = '07773bb3-4969-4bce-8ce2-faab3b26383c'
  AND deleted_at IS NULL
  AND (
    notes ILIKE '%[DEMO_TASKS_PREMIUM]%'
    OR title ILIKE '%[דמו]%'
  );

DELETE FROM public.calendar_events
WHERE client_id = '07773bb3-4969-4bce-8ce2-faab3b26383c'
  AND description ILIKE '%[DEMO_TASKS_PREMIUM]%';

UPDATE public.building_assets
SET deleted_at = now(), updated_at = now()
WHERE client_id = '07773bb3-4969-4bce-8ce2-faab3b26383c'
  AND deleted_at IS NULL
  AND notes ILIKE '%[DEMO_TASKS_PREMIUM]%';

UPDATE public.maintenance_task_template_sets
SET deleted_at = now(), updated_at = now()
WHERE client_id = '07773bb3-4969-4bce-8ce2-faab3b26383c'
  AND deleted_at IS NULL
  AND name ILIKE '%דמו%';

-- Worker hourly rates for cost demo
UPDATE public.workers
SET hourly_rate = CASE full_name
  WHEN 'יוסי תחזוקה' THEN 95
  WHEN 'אבי שירות' THEN 85
  WHEN 'Yoni Levy' THEN 120
  ELSE hourly_rate
END
WHERE client_id = '07773bb3-4969-4bce-8ce2-faab3b26383c'
  AND deleted_at IS NULL
  AND full_name IN ('יוסי תחזוקה', 'אבי שירות', 'Yoni Levy');

-- Assets
WITH ins AS (
  INSERT INTO public.building_assets (client_id, project_id, name, kind, notes)
  VALUES
    ('07773bb3-4969-4bce-8ce2-faab3b26383c', '5ff39052-3cb5-4716-81a6-beb3340e0ce5', 'משאבת מים ראשית', 'pump', '[DEMO_TASKS_PREMIUM] חדר משאבות קומה 0'),
    ('07773bb3-4969-4bce-8ce2-faab3b26383c', '5ff39052-3cb5-4716-81a6-beb3340e0ce5', 'מעלית נוסעים A', 'elevator', '[DEMO_TASKS_PREMIUM] יצרן OTIS'),
    ('07773bb3-4969-4bce-8ce2-faab3b26383c', 'f5e844c2-c8bb-45e3-a88d-66bfa840dfa0', 'גג / ניקוז מערבי', 'roof', '[DEMO_TASKS_PREMIUM] מרזבים'),
    ('07773bb3-4969-4bce-8ce2-faab3b26383c', '6214dd67-cc20-4239-a4c9-149d3449df60', 'לוח חשמל ראשי', 'electrical', '[DEMO_TASKS_PREMIUM] חדר חשמל'),
    ('07773bb3-4969-4bce-8ce2-faab3b26383c', '56222104-fd7b-45f8-90bc-ec6dd1b89478', 'מערכת כיבוי אש', 'fire', '[DEMO_TASKS_PREMIUM] מטפים + גלאים'),
    ('07773bb3-4969-4bce-8ce2-faab3b26383c', '401b99be-4706-4b44-aa7b-6b5a8587ee27', 'אינטרקום כניסה', 'access', '[DEMO_TASKS_PREMIUM] לובי')
  RETURNING id, name, project_id
)
SELECT count(*) AS assets_created FROM ins;

-- Org template set
INSERT INTO public.maintenance_task_template_sets (client_id, name, items)
VALUES (
  '07773bb3-4969-4bce-8ce2-faab3b26383c',
  'סט אחזקה דמו — בניין מגורים',
  '[
    {"title":"ניקוי חדר מדרגות","cadence":"weekly","priority":"MEDIUM","checklist":["מדרגות","פחים","תאורה"],"estimated_minutes":45},
    {"title":"בדיקת משאבת מים","cadence":"monthly","priority":"HIGH","checklist":["רעשים","דליפות","לחץ"],"estimated_minutes":30},
    {"title":"סיור מעלית","cadence":"monthly","priority":"HIGH","checklist":["תא","כפתורים","חדר מכונות"],"estimated_minutes":25},
    {"title":"בדיקת גג וניקוזים","cadence":"quarterly","priority":"MEDIUM","checklist":["מרזבים","אטמים"],"estimated_minutes":40},
    {"title":"בטיחות אש","cadence":"yearly","priority":"HIGH","checklist":["גלאי עשן","מטפים","יציאות"],"estimated_minutes":90}
  ]'::jsonb
);

-- Tasks (Israel local times expressed as +02)
WITH w AS (
  SELECT
    '98354bf5-f50c-4550-9f2a-4e549be4868c'::uuid AS yossi,
    '48f5e279-0498-413d-b64f-5ca5076b1f94'::uuid AS avi,
    '515fd3bb-2066-4668-a850-a6bbc91360b5'::uuid AS yoni,
    '832553e9-4eba-45c6-985a-2bcc8795571c'::uuid AS manager
),
a AS (
  SELECT id, name, project_id FROM public.building_assets
  WHERE client_id = '07773bb3-4969-4bce-8ce2-faab3b26383c'
    AND deleted_at IS NULL
    AND notes ILIKE '%[DEMO_TASKS_PREMIUM]%'
),
ins AS (
  INSERT INTO public.maintenance_tasks (
    client_id, project_id, assigned_worker_id, title, description, notes,
    priority, status, due_at, cadence, checklist_items,
    estimated_minutes, actual_cost_ils, asset_id,
    completed_at, completed_by_worker_id, completed_by_user_id, created_by
  )
  SELECT
    '07773bb3-4969-4bce-8ce2-faab3b26383c',
    x.project_id,
    x.worker_id,
    x.title,
    x.description,
    x.notes,
    x.priority,
    x.status,
    x.due_at,
    x.cadence,
    x.checklist_items::jsonb,
    x.estimated_minutes,
    x.actual_cost_ils,
    x.asset_id,
    x.completed_at,
    x.completed_by_worker_id,
    x.completed_by_user_id,
    (SELECT manager FROM w)
  FROM (
    VALUES
      -- OVERDUE (morning)
      (
        '5ff39052-3cb5-4716-81a6-beb3340e0ce5'::uuid,
        (SELECT yossi FROM w),
        '[דמו] תיקון דליפת משאבה — באיחור',
        'דווח על רטיבות ליד המשאבה. דחוף לסיום.',
        '[DEMO_TASKS_PREMIUM] overdue',
        'URGENT',
        'IN_PROGRESS',
        '2026-11-16T08:00:00+02:00'::timestamptz,
        'one_off',
        '[{"id":"c1","text":"איתור מקור הדליפה","done_at":"2026-11-16T09:00:00+02:00"},{"id":"c2","text":"החלפת אטם","done_at":null},{"id":"c3","text":"בדיקת לחץ אחרי תיקון","done_at":null}]',
        60,
        NULL::numeric,
        (SELECT id FROM a WHERE name = 'משאבת מים ראשית' LIMIT 1),
        NULL::timestamptz,
        NULL::uuid,
        NULL::uuid
      ),
      (
        'f5e844c2-c8bb-45e3-a88d-66bfa840dfa0'::uuid,
        (SELECT avi FROM w),
        '[דמו] ניקוי מרזבים אחרי גשם',
        'נשארו עלים במרזב המערבי — סיכון להצפה.',
        '[DEMO_TASKS_PREMIUM] overdue',
        'HIGH',
        'PENDING',
        '2026-11-17T10:00:00+02:00'::timestamptz,
        'quarterly',
        '[{"id":"c1","text":"ניקוי מרזבים","done_at":null},{"id":"c2","text":"צילום לפני/אחרי","done_at":null}]',
        40,
        NULL,
        (SELECT id FROM a WHERE name = 'גג / ניקוז מערבי' LIMIT 1),
        NULL, NULL, NULL
      ),
      -- TODAY
      (
        '401b99be-4706-4b44-aa7b-6b5a8587ee27'::uuid,
        (SELECT yossi FROM w),
        '[דמו] ניקוי חדר מדרגות שבועי',
        'לובי + קומות 1–4. תיעוד תמונה מומלץ.',
        '[DEMO_TASKS_PREMIUM] today',
        'MEDIUM',
        'PENDING',
        '2026-11-18T09:30:00+02:00'::timestamptz,
        'weekly',
        '[{"id":"c1","text":"ניקוי מדרגות","done_at":null},{"id":"c2","text":"ריקון פחים","done_at":null},{"id":"c3","text":"בדיקת תאורה","done_at":null}]',
        45,
        NULL,
        NULL,
        NULL, NULL, NULL
      ),
      (
        '5ff39052-3cb5-4716-81a6-beb3340e0ce5'::uuid,
        (SELECT avi FROM w),
        '[דמו] בדיקת לובי ואינטרקום',
        'סיור כניסה — דלת, אינטרקום, תאורה.',
        '[DEMO_TASKS_PREMIUM] today',
        'MEDIUM',
        'IN_PROGRESS',
        '2026-11-18T14:00:00+02:00'::timestamptz,
        'weekly',
        '[{"id":"c1","text":"דלת כניסה","done_at":"2026-11-18T14:10:00+02:00"},{"id":"c2","text":"אינטרקום","done_at":null},{"id":"c3","text":"ניקיון כניסה","done_at":null}]',
        20,
        NULL,
        (SELECT id FROM a WHERE name = 'אינטרקום כניסה' LIMIT 1),
        NULL, NULL, NULL
      ),
      (
        '6214dd67-cc20-4239-a4c9-149d3449df60'::uuid,
        (SELECT yoni FROM w),
        '[דמו] בדיקת לוח חשמל — רעש ממגע',
        'דייר דיווח על רעש קל בלוח. לבדוק חום/מגע.',
        '[DEMO_TASKS_PREMIUM] today',
        'HIGH',
        'PENDING',
        '2026-11-18T16:30:00+02:00'::timestamptz,
        'one_off',
        '[{"id":"c1","text":"מדידת חום","done_at":null},{"id":"c2","text":"הידוק מגעים","done_at":null}]',
        35,
        NULL,
        (SELECT id FROM a WHERE name = 'לוח חשמל ראשי' LIMIT 1),
        NULL, NULL, NULL
      ),
      -- THIS WEEK (tomorrow → Sun) for week board + morning week bucket
      (
        '56222104-fd7b-45f8-90bc-ec6dd1b89478'::uuid,
        (SELECT yossi FROM w),
        '[דמו] סיור מעלית חודשי',
        'בדיקה חזותית + תיעוד חריגות למנהל.',
        '[DEMO_TASKS_PREMIUM] week',
        'HIGH',
        'PENDING',
        '2026-11-19T11:00:00+02:00'::timestamptz,
        'monthly',
        '[{"id":"c1","text":"תא נוסעים","done_at":null},{"id":"c2","text":"כפתורים","done_at":null},{"id":"c3","text":"חדר מכונות","done_at":null}]',
        25,
        NULL,
        (SELECT id FROM a WHERE name LIKE 'מעלית%' LIMIT 1),
        NULL, NULL, NULL
      ),
      (
        'f064c0bb-65c6-4cbf-9354-0be9d06bd463'::uuid,
        (SELECT avi FROM w),
        '[דמו] גינון כניסה — השקיה וגיזום',
        'השקיה + גיזום שיחים בכניסה.',
        '[DEMO_TASKS_PREMIUM] week',
        'LOW',
        'PENDING',
        '2026-11-20T08:00:00+02:00'::timestamptz,
        'weekly',
        '[{"id":"c1","text":"השקיה","done_at":null},{"id":"c2","text":"גיזום","done_at":null}]',
        50,
        NULL,
        NULL,
        NULL, NULL, NULL
      ),
      (
        '5ff39052-3cb5-4716-81a6-beb3340e0ce5'::uuid,
        (SELECT yossi FROM w),
        '[דמו] בדיקת משאבת מים חודשית',
        'רעשים, דליפות, מד לחץ.',
        '[DEMO_TASKS_PREMIUM] week',
        'HIGH',
        'PENDING',
        '2026-11-21T10:00:00+02:00'::timestamptz,
        'monthly',
        '[{"id":"c1","text":"רעשים חריגים","done_at":null},{"id":"c2","text":"דליפות","done_at":null},{"id":"c3","text":"מד לחץ","done_at":null}]',
        30,
        NULL,
        (SELECT id FROM a WHERE name = 'משאבת מים ראשית' LIMIT 1),
        NULL, NULL, NULL
      ),
      (
        'd2ed629e-7cb1-4640-b3b7-d37e46d34827'::uuid,
        (SELECT avi FROM w),
        '[דמו] חיטוי חדר אשפה',
        'חיטוי שבועי + החלפת שקיות.',
        '[DEMO_TASKS_PREMIUM] week',
        'MEDIUM',
        'PENDING',
        '2026-11-22T09:00:00+02:00'::timestamptz,
        'weekly',
        '[{"id":"c1","text":"ריקון","done_at":null},{"id":"c2","text":"חיטוי","done_at":null}]',
        30,
        NULL,
        NULL,
        NULL, NULL, NULL
      ),
      (
        '5d630011-38e4-48b4-a89d-2c25b27f1a4c'::uuid,
        (SELECT yoni FROM w),
        '[דמו] תיאום טכנאי מעלית חיצוני',
        'שיחת תיאום לספק OTIS — תאריך מועדף ראשון בשבוע.',
        '[DEMO_TASKS_PREMIUM] week',
        'MEDIUM',
        'PENDING',
        '2026-11-23T12:00:00+02:00'::timestamptz,
        'one_off',
        '[{"id":"c1","text":"חיוג לספק","done_at":null},{"id":"c2","text":"עדכון מנהל","done_at":null}]',
        15,
        NULL,
        NULL,
        NULL, NULL, NULL
      ),
      -- OPEN without due (shows in open/all)
      (
        '9dd122de-4e76-4fc6-afe7-6248b8e64553'::uuid,
        (SELECT avi FROM w),
        '[דמו] החלפת נורות חדר מדרגות',
        'מלאי נורות LED במשרד — לתאם עם דייר קומה 3.',
        '[DEMO_TASKS_PREMIUM] open-no-due',
        'LOW',
        'PENDING',
        NULL::timestamptz,
        'one_off',
        '[{"id":"c1","text":"החלפת נורות קומה 2-3","done_at":null}]',
        25,
        NULL,
        NULL,
        NULL, NULL, NULL
      ),
      (
        '0d272903-16e9-47a1-a762-142274940351'::uuid,
        NULL::uuid,
        '[דמו] משימה ללא שיוך — המתנה להמלצה',
        'לבחור עובד דרך «המלץ עובד» בטופס.',
        '[DEMO_TASKS_PREMIUM] unassigned',
        'MEDIUM',
        'PENDING',
        '2026-11-25T10:00:00+02:00'::timestamptz,
        'one_off',
        '[]',
        20,
        NULL,
        NULL,
        NULL, NULL, NULL
      ),
      -- LATER (all tab, not morning)
      (
        '56222104-fd7b-45f8-90bc-ec6dd1b89478'::uuid,
        (SELECT yossi FROM w),
        '[דמו] בדיקת מערכות בטיחות אש שנתית',
        'תיאום ספק + סיור מטפים וגלאים.',
        '[DEMO_TASKS_PREMIUM] later yearly',
        'HIGH',
        'PENDING',
        '2026-12-10T09:00:00+02:00'::timestamptz,
        'yearly',
        '[{"id":"c1","text":"גלאי עשן","done_at":null},{"id":"c2","text":"מטפים","done_at":null},{"id":"c3","text":"יציאות חירום","done_at":null}]',
        90,
        NULL,
        (SELECT id FROM a WHERE name = 'מערכת כיבוי אש' LIMIT 1),
        NULL, NULL, NULL
      ),
      (
        'f5e844c2-c8bb-45e3-a88d-66bfa840dfa0'::uuid,
        (SELECT avi FROM w),
        '[דמו] בדיקת גג רבעונית',
        'סיור גג וניקוזים — חורף.',
        '[DEMO_TASKS_PREMIUM] later quarterly',
        'MEDIUM',
        'PENDING',
        '2026-12-05T08:30:00+02:00'::timestamptz,
        'quarterly',
        '[{"id":"c1","text":"מרזבים פנויים","done_at":null},{"id":"c2","text":"אטמים","done_at":null}]',
        40,
        NULL,
        (SELECT id FROM a WHERE name = 'גג / ניקוז מערבי' LIMIT 1),
        NULL, NULL, NULL
      ),
      -- DONE (KPI — without manager)
      (
        '5ff39052-3cb5-4716-81a6-beb3340e0ce5'::uuid,
        (SELECT yossi FROM w),
        '[דמו] ניקוי מדרגות — הושלם ע״י עובד',
        'בוצע מהשטח ללא התערבות מנהל.',
        '[DEMO_TASKS_PREMIUM] done-worker',
        'MEDIUM',
        'DONE',
        '2026-11-10T09:00:00+02:00'::timestamptz,
        'weekly',
        '[{"id":"c1","text":"ניקוי מדרגות","done_at":"2026-11-10T09:40:00+02:00"},{"id":"c2","text":"ריקון פחים","done_at":"2026-11-10T09:45:00+02:00"}]',
        45,
        71.25,
        NULL,
        '2026-11-10T09:50:00+02:00'::timestamptz,
        (SELECT yossi FROM w),
        NULL
      ),
      (
        '6214dd67-cc20-4239-a4c9-149d3449df60'::uuid,
        (SELECT avi FROM w),
        '[דמו] החלפת פילטר משאבה — הושלם',
        'עובד סגר מהפורטל + עלות.',
        '[DEMO_TASKS_PREMIUM] done-worker',
        'HIGH',
        'DONE',
        '2026-11-05T11:00:00+02:00'::timestamptz,
        'monthly',
        '[{"id":"c1","text":"פירוק פילטר","done_at":"2026-11-05T11:20:00+02:00"},{"id":"c2","text":"התקנת חדש","done_at":"2026-11-05T11:35:00+02:00"}]',
        40,
        56.67,
        (SELECT id FROM a WHERE name = 'משאבת מים ראשית' LIMIT 1),
        '2026-11-05T11:40:00+02:00'::timestamptz,
        (SELECT avi FROM w),
        NULL
      ),
      (
        '401b99be-4706-4b44-aa7b-6b5a8587ee27'::uuid,
        (SELECT yossi FROM w),
        '[דמו] סיור לובי — הושלם ע״י עובד',
        'KPI sample.',
        '[DEMO_TASKS_PREMIUM] done-worker',
        'LOW',
        'DONE',
        '2026-11-12T08:00:00+02:00'::timestamptz,
        'weekly',
        '[{"id":"c1","text":"סיור","done_at":"2026-11-12T08:15:00+02:00"}]',
        20,
        31.67,
        NULL,
        '2026-11-12T08:20:00+02:00'::timestamptz,
        (SELECT yossi FROM w),
        NULL
      ),
      -- DONE by manager (contrast for KPI)
      (
        'f064c0bb-65c6-4cbf-9354-0be9d06bd463'::uuid,
        (SELECT avi FROM w),
        '[דמו] סגירה ידנית ע״י מנהל',
        'נסגר מהדשבורד — לא נספר ב־% ללא מנהל.',
        '[DEMO_TASKS_PREMIUM] done-manager',
        'MEDIUM',
        'DONE',
        '2026-11-08T13:00:00+02:00'::timestamptz,
        'one_off',
        '[]',
        15,
        0,
        NULL,
        '2026-11-08T13:10:00+02:00'::timestamptz,
        NULL,
        (SELECT manager FROM w)
      )
  ) AS x(
    project_id, worker_id, title, description, notes, priority, status, due_at, cadence,
    checklist_items, estimated_minutes, actual_cost_ils, asset_id,
    completed_at, completed_by_worker_id, completed_by_user_id
  )
  RETURNING id, cadence, due_at, title, status
)
UPDATE public.maintenance_tasks t
SET series_id = t.id,
    color_key = CASE t.cadence
      WHEN 'weekly' THEN 'weekly'
      WHEN 'monthly' THEN 'monthly'
      WHEN 'quarterly' THEN 'quarterly'
      WHEN 'yearly' THEN 'yearly'
      ELSE 'one_off'
    END,
    updated_at = now()
WHERE t.id IN (SELECT id FROM ins)
  AND t.cadence <> 'one_off';

-- Calendar events for combined week view
INSERT INTO public.calendar_events (
  client_id, project_id, title, description, location,
  starts_at, ends_at, all_day, event_type, created_by
)
VALUES
  (
    '07773bb3-4969-4bce-8ce2-faab3b26383c',
    '5ff39052-3cb5-4716-81a6-beb3340e0ce5',
    'ישיבת ועד — תקציב אחזקה',
    '[DEMO_TASKS_PREMIUM] committee',
    'לובי 1א',
    '2026-11-18T18:00:00+02:00',
    '2026-11-18T19:00:00+02:00',
    false,
    'committee',
    '832553e9-4eba-45c6-985a-2bcc8795571c'
  ),
  (
    '07773bb3-4969-4bce-8ce2-faab3b26383c',
    '56222104-fd7b-45f8-90bc-ec6dd1b89478',
    'ביקור טכנאי מעלית',
    '[DEMO_TASKS_PREMIUM] professional',
    'חדר מכונות',
    '2026-11-19T10:00:00+02:00',
    '2026-11-19T11:30:00+02:00',
    false,
    'professional',
    '832553e9-4eba-45c6-985a-2bcc8795571c'
  ),
  (
    '07773bb3-4969-4bce-8ce2-faab3b26383c',
    '401b99be-4706-4b44-aa7b-6b5a8587ee27',
    'סיור מנהל — בוקר תפעולי',
    '[DEMO_TASKS_PREMIUM] internal',
    NULL,
    '2026-11-20T08:30:00+02:00',
    '2026-11-20T09:30:00+02:00',
    false,
    'internal',
    '832553e9-4eba-45c6-985a-2bcc8795571c'
  ),
  (
    '07773bb3-4969-4bce-8ce2-faab3b26383c',
    '5ff39052-3cb5-4716-81a6-beb3340e0ce5',
    'תחזוקה מחזורית — משאבה',
    '[DEMO_TASKS_PREMIUM] maintenance',
    'חדר משאבות',
    '2026-11-21T10:00:00+02:00',
    '2026-11-21T10:45:00+02:00',
    false,
    'maintenance',
    '832553e9-4eba-45c6-985a-2bcc8795571c'
  ),
  (
    '07773bb3-4969-4bce-8ce2-faab3b26383c',
    NULL,
    'פגישת ספק ניקיון',
    '[DEMO_TASKS_PREMIUM] other',
    'משרד',
    '2026-11-23T11:00:00+02:00',
    '2026-11-23T12:00:00+02:00',
    false,
    'other',
    '832553e9-4eba-45c6-985a-2bcc8795571c'
  );

COMMIT;
