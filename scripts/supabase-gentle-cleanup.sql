-- ═══════════════════════════════════════════════════════════════════════════
-- Bamakor — ניקוי עדין (בלי לגעת בנתונים עסקיים)
-- הרצה: Supabase Dashboard → SQL Editor → פרויקט Bamakor
--
-- סדר מומלץ:
--   1) להריץ את חלק א' (ביקורת) בלבד — לקרוא את התוצאות
--   2) להריץ את חלק ב' (תצוגה מקדימה) — כמה שורות יימחקו
--   3) רק אז להסיר הערות מחלק ג' ולהריץ שורה-שורה
--
-- מה לעולם לא נוגעים בו כאן:
--   tickets, residents, workers, projects, whatsapp_messages,
--   worker_attendance_events, collection_*, clients, office_* (QR ישן),
--   audit_log, failed_notifications, error_logs
--
-- חיסכון ~$9/חודש מ-Branching: לא SQL — ראה סוף הקובץ (Dashboard).
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- חלק א' — ביקורת בלבד (בטוח להריץ תמיד)
-- ───────────────────────────────────────────────────────────────────────────

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

-- א2) כמה שורות בטבלאות "זמניות" / לוגים תפעוליים
SELECT * FROM (
  SELECT 'api_rate_limits'::text AS tbl,
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
  FROM processed_webhooks
  UNION ALL
  SELECT 'feature_page_views',
         count(*),
         count(*) FILTER (WHERE created_at > now() - interval '90 days')
  FROM feature_page_views
  UNION ALL
  SELECT 'system_logs',
         count(*),
         count(*) FILTER (WHERE created_at > now() - interval '60 days')
  FROM system_logs
) t
ORDER BY total_rows DESC;

-- א3) Storage (קבצים) — רק מידע, בלי מחיקה
SELECT
  bucket_id,
  count(*) AS objects,
  pg_size_pretty(coalesce(sum((metadata->>'size')::bigint), 0)) AS approx_bytes
FROM storage.objects
GROUP BY bucket_id
ORDER BY coalesce(sum((metadata->>'size')::bigint), 0) DESC;


-- ───────────────────────────────────────────────────────────────────────────
-- חלק ב' — תצוגה מקדימה: כמה יימחק בחלק ג' (עדיין בלי DELETE)
-- ───────────────────────────────────────────────────────────────────────────

SELECT 'rate_limits_older_than_7d' AS candidate,
       count(*)::bigint AS would_delete
FROM api_rate_limits
WHERE window_start < now() - interval '7 days'

UNION ALL
SELECT 'pending_selections_expired_1d_ago',
       count(*)
FROM pending_selections
WHERE expires_at < now() - interval '1 day'

UNION ALL
SELECT 'sessions_inactive_30d',
       count(*)
FROM sessions
WHERE is_active = false
  AND last_activity_at < now() - interval '30 days'

UNION ALL
SELECT 'feature_page_views_older_than_90d',
       count(*)
FROM feature_page_views
WHERE created_at < now() - interval '90 days'

UNION ALL
SELECT 'processed_webhooks_older_than_30d',
       count(*)
FROM processed_webhooks
WHERE processed_at < now() - interval '30 days'

UNION ALL
SELECT 'system_logs_older_than_60d',
       count(*)
FROM system_logs
WHERE created_at < now() - interval '60 days';


-- ───────────────────────────────────────────────────────────────────────────
-- חלק ג' — מחיקות עדינות (מוערות בכוונה)
-- הסר "-- " רק משורה שאתה מאשר אחרי שראית את המספרים בחלק ב'.
-- מומלץ: BEGIN; … ; ROLLBACK; קודם, ואז COMMIT בריצה נפרדת.
-- ───────────────────────────────────────────────────────────────────────────

-- BEGIN;

-- ג1) חלונות rate-limit ישנים (לא נתוני לקוח)
-- DELETE FROM api_rate_limits
-- WHERE window_start < now() - interval '7 days';

-- ג2) בחירת בניין ב-WhatsApp שפג תוקפן
-- DELETE FROM pending_selections
-- WHERE expires_at < now() - interval '1 day';

-- ג3) סשנים לא פעילים מעל 30 יום (לא tickets / הודעות)
-- DELETE FROM sessions
-- WHERE is_active = false
--   AND last_activity_at < now() - interval '30 days';

-- ג4) צפיות בעמודים לטאב usage — מעל 90 יום
-- DELETE FROM feature_page_views
-- WHERE created_at < now() - interval '90 days';

-- ג5) dedupe של webhooks שכבר עובדו — מעל 30 יום
-- DELETE FROM processed_webhooks
-- WHERE processed_at < now() - interval '30 days';

-- ג6) לוגים תפעוליים (cron/health) — מעל 60 יום
-- DELETE FROM system_logs
-- WHERE created_at < now() - interval '60 days';

-- ROLLBACK;
-- (אחרי בדיקה: החלף ל-COMMIT;)


-- ───────────────────────────────────────────────────────────────────────────
-- לא כלול במכוון (אל תריץ בלי החלטה מפורשת):
--   • office_staff / office_time_entries — נתוני QR ישן; אולי צריך לשכר
--   • whatsapp_messages, tickets, residents, attendance
--   • audit_log / error_logs / failed_notifications
--   • קבצים ב-Storage
-- ───────────────────────────────────────────────────────────────────────────


-- ═══════════════════════════════════════════════════════════════════════════
-- Branching (~$9/חודש) — זה החיסכון האמיתי, בלי SQL ובלי סיכון לנתונים
-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Dashboard → Bamakor → Branches → מחק preview branches ישנים
-- 2. אותו דבר לפרויקט Naaryo אם יש
-- 3. Project Settings → Integrations → GitHub:
--      • Delete branch when PR closed/merged = ON
--      • Supabase changes only = ON  (branch רק כשיש שינוי ב-supabase/)
-- מחיר: ~$0.01344 לשעה לכל preview branch פעיל (Micro)
