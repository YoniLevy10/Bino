-- ═══════════════════════════════════════════════════════════════════════════
-- Bamakor — ניקוי עדין — חלק א'+ב' בלבד (READ-ONLY)
-- אין CREATE / DROP / DELETE כאן → לא אמור להופיע דיאלוג RLS / destructive.
--
-- אם טבלה חסרה (כמו system_logs) — הרץ את השאילתות אחת-אחת; דלג על מה שנכשל.
-- חלק ג' (מחיקות) בקובץ נפרד / למטה מוער — אל תריץ עד אחרי שראית מספרים.
-- ═══════════════════════════════════════════════════════════════════════════


-- א1) הטבלאות הכי כבדות בדיסק
SELECT
  c.relname AS table_name,
  pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size,
  pg_total_relation_size(c.oid) AS bytes
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
ORDER BY pg_total_relation_size(c.oid) DESC
LIMIT 25;


-- א2) אילו טבלאות ניקוי בכלל קיימות (missing = לא קיימת)
SELECT t.tbl,
       CASE WHEN to_regclass('public.' || t.tbl) IS NULL THEN 'missing' ELSE 'ok' END AS status
FROM (VALUES
  ('api_rate_limits'),
  ('pending_selections'),
  ('sessions'),
  ('processed_webhooks'),
  ('feature_page_views'),
  ('system_logs')
) AS t(tbl);


-- א3) ספירות — הרץ רק אם status=ok בא2
-- (system_logs אצלך: missing → דלג על השורה שלה)

SELECT 'api_rate_limits' AS tbl,
       count(*)::bigint AS total_rows,
       count(*) FILTER (WHERE window_start > now() - interval '7 days')::bigint AS recent_or_valid
FROM api_rate_limits
UNION ALL
SELECT 'pending_selections',
       count(*),
       count(*) FILTER (WHERE expires_at > now())
FROM pending_selections
UNION ALL
SELECT 'sessions',
       count(*),
       count(*) FILTER (WHERE is_active)
FROM sessions
UNION ALL
SELECT 'processed_webhooks',
       count(*),
       count(*) FILTER (WHERE processed_at > now() - interval '30 days')
FROM processed_webhooks;
-- אופציונלי (רק אם א2 מראה ok):
-- SELECT 'feature_page_views', count(*), count(*) FILTER (WHERE created_at > now() - interval '90 days') FROM feature_page_views;


-- א4) Storage
SELECT
  bucket_id,
  count(*) AS objects,
  pg_size_pretty(coalesce(sum((metadata->>'size')::bigint), 0)) AS approx_bytes
FROM storage.objects
GROUP BY bucket_id
ORDER BY coalesce(sum((metadata->>'size')::bigint), 0) DESC;


-- ב) כמה יימחק בחלק ג' (עדיין בלי DELETE)
SELECT 'rate_limits_older_than_7d' AS candidate,
       count(*)::bigint AS would_delete
FROM api_rate_limits
WHERE window_start < now() - interval '7 days'
UNION ALL
SELECT 'pending_selections_expired_1d_ago', count(*)
FROM pending_selections
WHERE expires_at < now() - interval '1 day'
UNION ALL
SELECT 'sessions_inactive_30d', count(*)
FROM sessions
WHERE is_active = false
  AND last_activity_at < now() - interval '30 days'
UNION ALL
SELECT 'processed_webhooks_older_than_30d', count(*)
FROM processed_webhooks
WHERE processed_at < now() - interval '30 days';
-- אופציונלי אם feature_page_views קיימת:
-- SELECT 'feature_page_views_older_than_90d', count(*) FROM feature_page_views WHERE created_at < now() - interval '90 days';


-- ───────────────────────────────────────────────────────────────────────────
-- חלק ג' — מחיקות (הכל מוער). אל תסיר הערות עד אחרי חלק ב'.
-- אם מדביקים את כל הקובץ: השורות האלה לא רצות (מוערות) —
-- אבל עדיף להדביק רק א'+ב' למעלה כדי להימנע מאזהרת Supabase.
-- ───────────────────────────────────────────────────────────────────────────

-- DELETE FROM api_rate_limits WHERE window_start < now() - interval '7 days';
-- DELETE FROM pending_selections WHERE expires_at < now() - interval '1 day';
-- DELETE FROM sessions WHERE is_active = false AND last_activity_at < now() - interval '30 days';
-- DELETE FROM processed_webhooks WHERE processed_at < now() - interval '30 days';
-- DELETE FROM feature_page_views WHERE created_at < now() - interval '90 days';
-- (system_logs — דלג, הטבלה לא קיימת)


-- Branching (~$9/חודש): Dashboard → Branches → מחק preview ישנים
-- + Integrations → GitHub → auto-delete branch + "Supabase changes only"
