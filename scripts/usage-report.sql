-- Bamakor platform usage report (run in Supabase SQL Editor)
-- Paste results back for analysis. Window: last 30 days.

WITH params AS (
  SELECT now() - interval '30 days' AS since
),
client_base AS (
  SELECT id, name, plan_tier FROM clients
),
feature_raw AS (
  SELECT 'tickets'::text AS feature, client_id, created_at FROM tickets WHERE deleted_at IS NULL
  UNION ALL SELECT 'projects', client_id, created_at FROM projects
  UNION ALL SELECT 'residents', client_id, created_at FROM residents WHERE deleted_at IS NULL
  UNION ALL SELECT 'workers', client_id, created_at FROM workers WHERE deleted_at IS NULL
  UNION ALL SELECT 'calendar', client_id, created_at FROM calendar_events
  UNION ALL SELECT 'attendance', client_id, created_at FROM worker_attendance_events
  UNION ALL SELECT 'professionals', client_id, created_at FROM professionals
  UNION ALL SELECT 'pending_residents', client_id, created_at FROM pending_resident_join_requests
  UNION ALL SELECT 'pilot_sms', client_id, created_at FROM project_pilot_sms_runs
  UNION ALL SELECT 'project_documents', client_id, created_at FROM project_documents
  UNION ALL SELECT 'whatsapp_inbox', client_id, created_at FROM whatsapp_messages
  UNION ALL SELECT 'campaigns', client_id, created_at FROM sms_campaign_runs
  UNION ALL SELECT 'collections', client_id, created_at FROM collection_charges
  UNION ALL SELECT 'whatsapp_bot', client_id, created_at FROM sessions
  UNION ALL SELECT 'whatsapp_templates', client_id, created_at FROM whatsapp_templates
),
feature_summary AS (
  SELECT
    feature,
    count(*)::bigint AS total_events,
    count(*) FILTER (WHERE created_at >= (SELECT since FROM params))::bigint AS recent_events,
    count(DISTINCT client_id)::bigint AS clients_ever,
    count(DISTINCT client_id) FILTER (WHERE created_at >= (SELECT since FROM params))::bigint AS clients_recent
  FROM feature_raw
  GROUP BY feature
),
paid AS (
  SELECT client_id, addon_key
  FROM client_paid_addons
  WHERE enabled = true
),
paid_unused AS (
  SELECT
    p.client_id,
    c.name AS client_name,
    p.addon_key
  FROM paid p
  JOIN client_base c ON c.id = p.client_id
  WHERE NOT EXISTS (
    SELECT 1 FROM feature_raw f
    WHERE f.client_id = p.client_id
      AND f.feature = CASE p.addon_key
        WHEN 'worker_stamp' THEN 'attendance'
        ELSE p.addon_key
      END
  )
)
SELECT 'feature_summary' AS section, to_jsonb(feature_summary) AS row
FROM feature_summary
ORDER BY (to_jsonb(feature_summary)->>'recent_events')::bigint DESC

UNION ALL

SELECT 'clients', to_jsonb(client_base) FROM client_base

UNION ALL

SELECT 'paid_addons_unused', to_jsonb(paid_unused) FROM paid_unused

UNION ALL

SELECT 'open_tickets_by_client', to_jsonb(x)
FROM (
  SELECT c.name, count(*)::bigint AS open_tickets
  FROM tickets t
  JOIN clients c ON c.id = t.client_id
  WHERE t.deleted_at IS NULL AND t.status <> 'CLOSED'
  GROUP BY c.name
  ORDER BY count(*) DESC
) x

UNION ALL

SELECT 'tickets_last_30d_by_client', to_jsonb(x)
FROM (
  SELECT c.name, count(*)::bigint AS tickets_30d
  FROM tickets t
  JOIN clients c ON c.id = t.client_id
  WHERE t.deleted_at IS NULL AND t.created_at >= (SELECT since FROM params)
  GROUP BY c.name
  ORDER BY count(*) DESC
) x;
