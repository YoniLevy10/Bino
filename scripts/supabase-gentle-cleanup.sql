-- ═══════════════════════════════════════════════════════════════════════════
-- Bamakor — ניקוי עדין (בלי לגעת בנתונים עסקיים)
-- הרצה: Supabase Dashboard → SQL Editor → פרויקט Bamakor
--
-- סדר מומלץ:
--   1) להריץ את חלק א' (ביקורת) בלבד — לקרוא את התוצאות
--   2) להריץ את חלק ב' (תצוגה מקדימה) — כמה שורות יימחקו
--   3) רק אז להסיר הערות מחלק ג' ולהריץ שורה-שורה
--
-- טבלאות חסרות (למשל system_logs אם מיגרציה לא הורצה) — נדלגות, לא נכשלות.
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
--    (missing = הטבלה לא קיימת בפרויקט — מדלגים)
DROP TABLE IF EXISTS _bamakor_cleanup_audit;
CREATE TEMP TABLE _bamakor_cleanup_audit (
  tbl text PRIMARY KEY,
  total_rows bigint,
  recent_or_valid bigint,
  note text
);

DO $$
BEGIN
  IF to_regclass('public.api_rate_limits') IS NOT NULL THEN
    INSERT INTO _bamakor_cleanup_audit
    SELECT 'api_rate_limits', count(*),
           count(*) FILTER (WHERE window_start > now() - interval '7 days'),
           'ok'
    FROM public.api_rate_limits;
  ELSE
    INSERT INTO _bamakor_cleanup_audit VALUES ('api_rate_limits', NULL, NULL, 'missing');
  END IF;

  IF to_regclass('public.pending_selections') IS NOT NULL THEN
    INSERT INTO _bamakor_cleanup_audit
    SELECT 'pending_selections', count(*),
           count(*) FILTER (WHERE expires_at > now()),
           'ok'
    FROM public.pending_selections;
  ELSE
    INSERT INTO _bamakor_cleanup_audit VALUES ('pending_selections', NULL, NULL, 'missing');
  END IF;

  IF to_regclass('public.sessions') IS NOT NULL THEN
    INSERT INTO _bamakor_cleanup_audit
    SELECT 'sessions', count(*),
           count(*) FILTER (WHERE is_active),
           'ok'
    FROM public.sessions;
  ELSE
    INSERT INTO _bamakor_cleanup_audit VALUES ('sessions', NULL, NULL, 'missing');
  END IF;

  IF to_regclass('public.processed_webhooks') IS NOT NULL THEN
    INSERT INTO _bamakor_cleanup_audit
    SELECT 'processed_webhooks', count(*),
           count(*) FILTER (WHERE processed_at > now() - interval '30 days'),
           'ok'
    FROM public.processed_webhooks;
  ELSE
    INSERT INTO _bamakor_cleanup_audit VALUES ('processed_webhooks', NULL, NULL, 'missing');
  END IF;

  IF to_regclass('public.feature_page_views') IS NOT NULL THEN
    INSERT INTO _bamakor_cleanup_audit
    SELECT 'feature_page_views', count(*),
           count(*) FILTER (WHERE created_at > now() - interval '90 days'),
           'ok'
    FROM public.feature_page_views;
  ELSE
    INSERT INTO _bamakor_cleanup_audit VALUES ('feature_page_views', NULL, NULL, 'missing');
  END IF;

  IF to_regclass('public.system_logs') IS NOT NULL THEN
    INSERT INTO _bamakor_cleanup_audit
    SELECT 'system_logs', count(*),
           count(*) FILTER (WHERE created_at > now() - interval '60 days'),
           'ok'
    FROM public.system_logs;
  ELSE
    INSERT INTO _bamakor_cleanup_audit VALUES ('system_logs', NULL, NULL, 'missing — skip cleanup');
  END IF;
END $$;

SELECT * FROM _bamakor_cleanup_audit ORDER BY total_rows DESC NULLS LAST;

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

DROP TABLE IF EXISTS _bamakor_cleanup_preview;
CREATE TEMP TABLE _bamakor_cleanup_preview (
  candidate text PRIMARY KEY,
  would_delete bigint,
  note text
);

DO $$
BEGIN
  IF to_regclass('public.api_rate_limits') IS NOT NULL THEN
    INSERT INTO _bamakor_cleanup_preview
    SELECT 'rate_limits_older_than_7d', count(*), 'ok'
    FROM public.api_rate_limits
    WHERE window_start < now() - interval '7 days';
  ELSE
    INSERT INTO _bamakor_cleanup_preview VALUES ('rate_limits_older_than_7d', NULL, 'missing');
  END IF;

  IF to_regclass('public.pending_selections') IS NOT NULL THEN
    INSERT INTO _bamakor_cleanup_preview
    SELECT 'pending_selections_expired_1d_ago', count(*), 'ok'
    FROM public.pending_selections
    WHERE expires_at < now() - interval '1 day';
  ELSE
    INSERT INTO _bamakor_cleanup_preview VALUES ('pending_selections_expired_1d_ago', NULL, 'missing');
  END IF;

  IF to_regclass('public.sessions') IS NOT NULL THEN
    INSERT INTO _bamakor_cleanup_preview
    SELECT 'sessions_inactive_30d', count(*), 'ok'
    FROM public.sessions
    WHERE is_active = false
      AND last_activity_at < now() - interval '30 days';
  ELSE
    INSERT INTO _bamakor_cleanup_preview VALUES ('sessions_inactive_30d', NULL, 'missing');
  END IF;

  IF to_regclass('public.feature_page_views') IS NOT NULL THEN
    INSERT INTO _bamakor_cleanup_preview
    SELECT 'feature_page_views_older_than_90d', count(*), 'ok'
    FROM public.feature_page_views
    WHERE created_at < now() - interval '90 days';
  ELSE
    INSERT INTO _bamakor_cleanup_preview VALUES ('feature_page_views_older_than_90d', NULL, 'missing');
  END IF;

  IF to_regclass('public.processed_webhooks') IS NOT NULL THEN
    INSERT INTO _bamakor_cleanup_preview
    SELECT 'processed_webhooks_older_than_30d', count(*), 'ok'
    FROM public.processed_webhooks
    WHERE processed_at < now() - interval '30 days';
  ELSE
    INSERT INTO _bamakor_cleanup_preview VALUES ('processed_webhooks_older_than_30d', NULL, 'missing');
  END IF;

  IF to_regclass('public.system_logs') IS NOT NULL THEN
    INSERT INTO _bamakor_cleanup_preview
    SELECT 'system_logs_older_than_60d', count(*), 'ok'
    FROM public.system_logs
    WHERE created_at < now() - interval '60 days';
  ELSE
    INSERT INTO _bamakor_cleanup_preview VALUES ('system_logs_older_than_60d', NULL, 'missing — skip');
  END IF;
END $$;

SELECT * FROM _bamakor_cleanup_preview ORDER BY would_delete DESC NULLS LAST;


-- ───────────────────────────────────────────────────────────────────────────
-- חלק ג' — מחיקות עדינות (מוערות בכוונה)
-- הסר "-- " רק משורה שאתה מאשר אחרי שראית את המספרים בחלק ב'.
-- דלג על כל שורה ש-note שלה היה missing.
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

-- ג4) צפיות בעמודים לטאב usage — מעל 90 יום (רק אם הטבלה קיימת)
-- DELETE FROM feature_page_views
-- WHERE created_at < now() - interval '90 days';

-- ג5) dedupe של webhooks שכבר עובדו — מעל 30 יום
-- DELETE FROM processed_webhooks
-- WHERE processed_at < now() - interval '30 days';

-- ג6) לוגים תפעוליים — רק אם system_logs קיימת (אצלך כרגע: missing, דלג)
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
