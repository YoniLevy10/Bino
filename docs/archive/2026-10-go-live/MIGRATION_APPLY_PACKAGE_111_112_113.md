# חבילת Apply — מיגרציות 111 / 112 / 113 / 121 + system_logs + worker_nfc_tags

**סטטוס:** מוכנה להצגה · **לא הוחלה בפרוד** · ממתין לאישור owner (D1)  
**תאריך precheck:** 2026-10-03 (רענון באותו יום) · פרויקט Bamakor `jsliqlmjksintyigkulq`  
**כלל:** אין `apply_migration` / SQL כותב לפרוד עד אישור מפורש אחרי הצגת חבילה זו.

---

## 1. מטרת החבילה

| קובץ / שינוי | ממצא | נדרש ל־Go |
|--------------|------|-----------|
| יצירת `system_logs` (תוכן מ־`033_indexes_health_logs.sql`) | H4 | בניינים |
| `112_audit_projects_soft_delete.sql` | H8 | בניינים |
| `111_audit_whatsapp_phone_unique_and_rls_writes.sql` | B1, H1 | בניינים |
| `121_revoke_worker_nfc_attendance_writes.sql` | פער ב־111 (`nfc_tags`≠`worker_nfc_tags`) | בניינים |
| `113_audit_collection_charge_idempotency.sql` | B2 | **גבייה בלבד** |

---

## 2. תוצאות Precheck (READ-ONLY) — רענון

| בדיקה | תוצאה | משמעות |
|--------|--------|--------|
| כפילויות `whatsapp_phone_number_id` | **0** | UNIQUE בטוח להחלה |
| `projects.deleted_at` | **חסר** | 112 נדרש |
| `collection_charges.idempotency_key` | **חסר** | 113 נדרש לגבייה |
| index `clients_whatsapp_phone_number_id_uidx` | **חסר** | חלק מ־111 |
| `system_logs` | **חסר** | נדרש ל־health |
| `public.nfc_tags` | **לא קיים** | 111 לא מבטל כתיבה על NFC האמיתי |
| `public.worker_nfc_tags` | **קיים** | חובה 121 |
| `bamakor_rate_limit` / `api_rate_limits` | **קיימים** | מוכן ל־M11 מבוזר (לא חלק מחבילת D1) |
| כתיבות דפדפן לטבלאות 111 | לא נמצאו בקוד | סיכון שבירת UI נמוך אחרי REVOKE |

שאילתות שימוש חוזר (לקריאה בלבד לפני apply):

```sql
-- duplicates
SELECT whatsapp_phone_number_id, COUNT(*)
FROM clients
WHERE whatsapp_phone_number_id IS NOT NULL AND btrim(whatsapp_phone_number_id) <> ''
GROUP BY 1 HAVING COUNT(*) > 1;

-- flags
SELECT
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='projects' AND column_name='deleted_at') AS has_deleted_at,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='collection_charges' AND column_name='idempotency_key') AS has_idempotency,
  EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='clients_whatsapp_phone_number_id_uidx') AS has_wa_uidx,
  to_regclass('public.system_logs') IS NOT NULL AS has_system_logs,
  to_regclass('public.worker_nfc_tags') IS NOT NULL AS has_worker_nfc_tags,
  to_regclass('public.nfc_tags') IS NOT NULL AS has_nfc_tags;
```

---

## 3. סדר פריסה מומלץ

### חלון A — Go בניינים (אחרי אישור D1 מפורש)

1. **Snapshot / point-in-time** — ודאו שיש PITR / backup זמין לפני DDL.  
2. **system_logs** — יצירת טבלה (+ אינדקסים מ־033 אם רלוונטי).  
3. **112** — `deleted_at` על `projects`.  
4. **111** — UNIQUE WA + REVOKE על רשימת הטבלאות בקובץ.  
5. **121** — `REVOKE` על `worker_nfc_tags` (+ `worker_attendance` אם קיימת).  
6. רענון `lib/database.types.ts` אם נדרש.  
7. Smoke: login → dashboard → תקלות / assign / update.

### חלון B — לפני Go גבייה (נפרד; יכול להיות מאוחר יותר)

8. **113** — `idempotency_key`.  
9. בדיקת create charge עם/בלי Idempotency-Key.

**אל תפעילו addon גבייה ללקוח חדש לפני חלון B.**

---

## 4. השפעה צפויה

| שינוי | השפעה על לקוחות | השפעה על אפליקציה |
|--------|------------------|-------------------|
| REVOKE authenticated | חוסם עקיפת API מ־PostgREST | אין — UI כבר דרך API+admin |
| UNIQUE WA | מונע שני clients עם אותו Meta phone id | כשל insert כפול — רצוי |
| soft-delete | מחיקת פרויקט לא מוחקת היסטוריה | קוד כבר מצפה לעמודה |
| system_logs | health מתחיל להישמר | crons קיימים |
| 113 | מאפשר idempotency בגבייה | קוד create כבר כותב לעמודה |

---

## 5. תוכנית התאוששות (Rollback) — בלי GRANT גורף אוטומטי

**כלל:** אין rollback אוטומטי שמחזיר `GRANT INSERT/UPDATE/DELETE` גורף ל־`authenticated`/`anon`. החזרת כתיבה PostgREST היא החלטת אבטחה מפורשת של owner בלבד, ורק לטבלאות ספציפיות שנמצאו כשבורות ב־smoke — לא סקריפט «החזר הכול».

| שלב | התאוששות מועדפת | הערה |
|-----|------------------|------|
| UNIQUE index | `DROP INDEX IF EXISTS clients_whatsapp_phone_number_id_uidx;` | בטוח יחסית אם insert נכשל |
| REVOKE (111/121) | **קודם:** rollback קוד / feature flag אם API נשבר; **רק אם** הוכח ש־UI תלוי בכתיבת JWT לטבלה ספציפית — `GRANT` **לטבלה אחת** אחרי תיעוד הסיבה | לא GRANT גורף לכל הרשימה |
| `projects.deleted_at` | **לא** DROP אם נכתבו ערכים; rollback התנהגות בקוד (להסיר פילטרים זמנית) | עמודה נשארת |
| `idempotency_key` | להסיר שימוש בכותרת בקוד לפני כל DROP; אחרת להשאיר עמודה | חלון B |
| `system_logs` | `TRUNCATE` / הפסקת כתיבה בקוד; `DROP TABLE` רק אם ריק ובהסכמה | |

**לפני apply:** שמרו העתק READ-ONLY של `information_schema.role_table_grants` לטבלאות המושפעות — לתיעוד בלבד, לא כסקריפט rollback אוטומטי.

**אם apply נכשל באמצע:** עצרו; אל תמשיכו ל־113; בדקו `has_table_privilege` + smoke login; פתחו חלון תיקון ממוקד.

---

## 6. קבלה אחרי apply (ראיות לסגירת ממצא)

```sql
SELECT has_table_privilege('authenticated','public.tickets','INSERT') AS tickets_ins; -- expect false
SELECT has_table_privilege('authenticated','public.worker_nfc_tags','INSERT') AS nfc_ins; -- expect false
SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname='public' AND indexname='clients_whatsapp_phone_number_id_uidx'); -- true
SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='projects' AND column_name='deleted_at'); -- true
SELECT to_regclass('public.system_logs') IS NOT NULL; -- true
-- only after window B:
SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='collection_charges' AND column_name='idempotency_key'); -- true
```

API smoke: assign-ticket / update-ticket / create-ticket (session) עדיין עובדים.

---

## 7. מה עדיין לא אומת בחבילה זו

- Apply בפועל לפרוד (ממתין לאישור D1)  
- PostgREST PATCH חי עם JWT משתמש אמיתי (דורש D4 / משתמש בדיקה מבודד)  
- תרגיל restore מלא (P9 / D5)
