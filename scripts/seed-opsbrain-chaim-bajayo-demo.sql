-- Demo seed for OpsBrain tenant (opsbrain1@gmail.com)
-- Replaces "אסף עו״ד" sample data with חיים בג'איו 1א–8ב + demo tickets.
-- Client: 07773bb3-4969-4bce-8ce2-faab3b26383c
-- Org:    a281af3c-99b6-4a4a-a5ba-9498e05e984e

BEGIN;

DO $$
DECLARE
  v_client_id uuid := '07773bb3-4969-4bce-8ce2-faab3b26383c';
  v_org_id uuid := 'a281af3c-99b6-4a4a-a5ba-9498e05e984e';
  v_worker_id uuid;
  v_project_ids uuid[] := ARRAY[]::uuid[];
  v_num int;
  v_suffix text;
  v_name text;
  v_code text;
  v_pid uuid;
  v_i int;
  v_status text;
  v_statuses text[] := ARRAY['NEW', 'ASSIGNED', 'IN_PROGRESS', 'WAITING', 'DONE', 'CLOSED'];
  v_priorities text[] := ARRAY['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
  v_descs text[] := ARRAY[
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
  ];
  v_reporters text[] := ARRAY[
    'דני כהן', 'יעל לוי', 'משה אברהם', 'רונית שמעון',
    'אבי גולן', 'נועה פרץ', 'אלירן מזרחי', 'שירה בן דוד'
  ];
  v_phones text[] := ARRAY[
    '0501234001', '0501234002', '0501234003', '0501234004',
    '0501234005', '0501234006', '0501234007', '0501234008'
  ];
BEGIN
  -- Clear operational data for this tenant
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ticket_internal_messages'
  ) THEN
    DELETE FROM ticket_internal_messages
    WHERE ticket_id IN (SELECT id FROM tickets WHERE client_id = v_client_id);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ticket_logs'
  ) THEN
    DELETE FROM ticket_logs
    WHERE ticket_id IN (SELECT id FROM tickets WHERE client_id = v_client_id);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ticket_attachments'
  ) THEN
    DELETE FROM ticket_attachments
    WHERE ticket_id IN (SELECT id FROM tickets WHERE client_id = v_client_id);
  END IF;

  DELETE FROM tickets WHERE client_id = v_client_id;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'pending_resident_join_requests'
  ) THEN
    DELETE FROM pending_resident_join_requests WHERE client_id = v_client_id;
  END IF;

  DELETE FROM sessions WHERE client_id = v_client_id;
  DELETE FROM residents WHERE client_id = v_client_id;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'worker_site_tours'
  ) THEN
    DELETE FROM worker_site_tours WHERE client_id = v_client_id;
  END IF;

  DELETE FROM projects WHERE client_id = v_client_id;
  DELETE FROM workers WHERE client_id = v_client_id;

  INSERT INTO workers (client_id, organization_id, full_name, name, phone, role, is_active)
  VALUES (v_client_id, v_org_id, 'יוסי תחזוקה', 'יוסי תחזוקה', '0509991122', 'worker', true)
  RETURNING id INTO v_worker_id;

  INSERT INTO workers (client_id, organization_id, full_name, name, phone, role, is_active)
  VALUES (v_client_id, v_org_id, 'אבי שירות', 'אבי שירות', '0509993344', 'worker', true);

  UPDATE clients
  SET
    name = 'חיים בג''איו',
    company_name = 'חיים בג''איו',
    display_name = 'חיים בג''איו',
    contact_name = 'OpsBrain Demo',
    plan = 'pro',
    plan_tier = 'pro',
    max_buildings = GREATEST(COALESCE(max_buildings, 0), 20),
    buildings_allowed = GREATEST(COALESCE(buildings_allowed, 0), 20)
  WHERE id = v_client_id;

  UPDATE organizations
  SET name = 'חיים בג''איו', slug = 'chaim-bajayo'
  WHERE id = v_org_id;

  FOR v_num IN 1..8 LOOP
    FOREACH v_suffix IN ARRAY ARRAY['א', 'ב'] LOOP
      v_name := format('חיים בג''איו %s%s', v_num, v_suffix);
      v_code := format(
        'HBJ%s%s',
        v_num,
        CASE WHEN v_suffix = 'א' THEN 'A' ELSE 'B' END
      );

      INSERT INTO projects (
        client_id,
        organization_id,
        name,
        project_code,
        address,
        address_en,
        qr_identifier,
        is_active
      )
      VALUES (
        v_client_id,
        v_org_id,
        v_name,
        v_code,
        v_name || ', תל אביב',
        format(
          'Haim Bajayo %s%s, Tel Aviv',
          v_num,
          CASE WHEN v_suffix = 'א' THEN 'A' ELSE 'B' END
        ),
        'START_' || v_code,
        true
      )
      RETURNING id INTO v_pid;

      v_project_ids := array_append(v_project_ids, v_pid);

      INSERT INTO residents (
        client_id, project_id, full_name, phone, normalized_phone, apartment_number
      )
      VALUES
        (
          v_client_id,
          v_pid,
          'דייר ' || v_name || ' דירה 1',
          '052700' || lpad(((v_num * 10) + CASE WHEN v_suffix = 'א' THEN 1 ELSE 2 END)::text, 4, '0'),
          '97252700' || lpad(((v_num * 10) + CASE WHEN v_suffix = 'א' THEN 1 ELSE 2 END)::text, 4, '0'),
          '1'
        ),
        (
          v_client_id,
          v_pid,
          'דייר ' || v_name || ' דירה 5',
          '052701' || lpad(((v_num * 10) + CASE WHEN v_suffix = 'א' THEN 1 ELSE 2 END)::text, 4, '0'),
          '97252701' || lpad(((v_num * 10) + CASE WHEN v_suffix = 'א' THEN 1 ELSE 2 END)::text, 4, '0'),
          '5'
        );
    END LOOP;
  END LOOP;

  FOR v_i IN 1..32 LOOP
    v_pid := v_project_ids[1 + ((v_i - 1) % array_length(v_project_ids, 1))];
    v_status := v_statuses[1 + ((v_i - 1) % array_length(v_statuses, 1))];

    INSERT INTO tickets (
      client_id,
      organization_id,
      project_id,
      reporter_phone,
      reporter_name,
      description,
      status,
      priority,
      source,
      language,
      assigned_worker_id,
      opened_at,
      created_at,
      updated_at,
      closed_at,
      building_number
    )
    VALUES (
      v_client_id,
      v_org_id,
      v_pid,
      v_phones[1 + ((v_i - 1) % array_length(v_phones, 1))],
      v_reporters[1 + ((v_i - 1) % array_length(v_reporters, 1))],
      v_descs[1 + ((v_i - 1) % array_length(v_descs, 1))],
      v_status,
      v_priorities[1 + ((v_i - 1) % array_length(v_priorities, 1))],
      'whatsapp',
      'he',
      CASE WHEN v_i % 3 = 0 THEN NULL ELSE v_worker_id END,
      now() - make_interval(hours => v_i * 7),
      now() - make_interval(hours => v_i * 7),
      now() - make_interval(hours => v_i * 3),
      CASE
        WHEN v_status IN ('DONE', 'CLOSED') THEN now() - make_interval(hours => v_i * 2)
        ELSE NULL
      END,
      NULL
    );
  END LOOP;
END $$;

COMMIT;

SELECT 'projects' AS k, count(*)::int AS n
FROM projects WHERE client_id = '07773bb3-4969-4bce-8ce2-faab3b26383c'
UNION ALL
SELECT 'tickets', count(*)::int
FROM tickets WHERE client_id = '07773bb3-4969-4bce-8ce2-faab3b26383c'
UNION ALL
SELECT 'residents', count(*)::int
FROM residents WHERE client_id = '07773bb3-4969-4bce-8ce2-faab3b26383c'
UNION ALL
SELECT 'workers', count(*)::int
FROM workers WHERE client_id = '07773bb3-4969-4bce-8ce2-faab3b26383c';

SELECT name FROM clients WHERE id = '07773bb3-4969-4bce-8ce2-faab3b26383c';
SELECT name FROM projects
WHERE client_id = '07773bb3-4969-4bce-8ce2-faab3b26383c'
ORDER BY name;
