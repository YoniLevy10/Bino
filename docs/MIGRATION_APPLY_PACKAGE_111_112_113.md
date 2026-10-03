# חבילת Apply — מיגרציות 111 / 112 / 113 + system_logs

**סטטוס:** מוכנה להצגה · **לא הוחלה בפרוד** · ממתין לאישור owner (D1)  
**תאריך precheck:** 2026-10-03 · פרויקט Bamakor `jsliqlmjksintyigkulq`  
**כלל:** אין `apply_migration` / SQL כותב לפרוד עד אישור מפורש אחרי הצגת חבילה זו.

---

## 1. מטרת החבילה

| קובץ / שינוי | ממצא | נדרש ל־Go |
|--------------|------|-----------|
| יצירת `system_logs` (תוכן מ־`033_indexes_health_logs.sql`) | H4 | בניינים |
| `112_audit_projects_soft_delete.sql` | H8 | בניינים |
| `111_audit_whatsapp_phone_unique_and_rls_writes.sql` | B1, H1 | בניינים |
| **משלים:** `REVOKE` על `worker_nfc_tags` (+ אופציונלי טבלאות attendance אם חסרות) | פער ב־111 (`nfc_tags` לא קיים) | בניינים |
| `113_audit_collection_charge_idempotency.sql` | B2 | **גבייה בלבד** |

---

## 2. תוצאות Precheck (READ-ONLY)

| בדיקה | תוצאה | משמעות |
|--------|--------|--------|
| כפילויות `whatsapp_phone_number_id` | **0** | UNIQUE בטוח להחלה |
| `projects.deleted_at` | חסר | 112 נדרש |
| `collection_charges.idempotency_key` | חסר | 113 נדרש לגבייה |
| index `clients_whatsapp_phone_number_id_uidx` | חסר | חלק מ־111 |
| `system_logs` | חסר | נדרש ל־health |
| `public.nfc_tags` | **לא קיים** | 111 לא יבטל כתיבה על טבלת NFC האמיתית |
| `public.worker_nfc_tags` | **קיים** | חובה REVOKE משלים |
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
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='deleted_at') AS has_deleted_at,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='collection_charges' AND column_name='idempotency_key') AS has_idempotency,
  EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='clients_whatsapp_phone_number_id_uidx') AS has_wa_uidx,
  to_regclass('public.system_logs') IS NOT NULL AS has_system_logs,
  to_regclass('public.worker_nfc_tags') IS NOT NULL AS has_worker_nfc_tags,
  to_regclass('public.nfc_tags') IS NOT NULL AS has_nfc_tags;
```

---

## 3. סדר פריסה מומלץ

### חלון A — Go בניינים (אחרי אישור D1)

1. **system_logs** — יצירת טבלה (+ אינדקסים מ־033 אם רלוונטי).  
2. **112** — `deleted_at` על projects.  
3. **111** — UNIQUE WA + REVOKE על רשימת הטבלאות בקובץ.  
4. **משלים חדש** (להוסיף ב־PR ייעודי לפני apply):  
   `REVOKE INSERT, UPDATE, DELETE ON TABLE public.worker_nfc_tags FROM authenticated, anon;`  
   (ואם קיימות: `worker_attendance` אם יש כתיבת authenticated — לבדוק `has_table_privilege` לפני).  
5. רענון `lib/database.types.ts`.  
6. Smoke login + תקלות.

### חלון B — לפני Go גבייה (יכול להיות מאוחר יותר)

7. **113** — `idempotency_key`.  
8. בדיקת create charge עם/בלי Idempotency-Key.

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

## 5. תוכנית Rollback

| שלב | Rollback |
|-----|----------|
| UNIQUE index | `DROP INDEX IF EXISTS clients_whatsapp_phone_number_id_uidx;` |
| REVOKE | `GRANT INSERT, UPDATE, DELETE ON TABLE public.<t> TO authenticated;` לכל טבלה שבוטלה (סקריפט מראש) |
| deleted_at | **לא** drop אם כבר נכתבו ערכים — להשאיר עמודה; rollback התנהגות בקוד |
| idempotency_key | להסיר שימוש בכותרת בקוד לפני drop; אחרת להשאיר עמודה |
| system_logs | `DROP TABLE` רק אם ריק / בהסכמה |

שמרו סקריפט GRANT מלא **לפני** apply (העתק מ־`information_schema.role_table_grants`).

---

## 6. קבלה אחרי apply (ראיות לסגירת ממצא)

```sql
SELECT has_table_privilege('authenticated','public.tickets','INSERT') AS tickets_ins; -- expect false
SELECT has_table_privilege('authenticated','public.worker_nfc_tags','INSERT') AS nfc_ins; -- expect false
SELECT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='clients_whatsapp_phone_number_id_uidx'); -- true
SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='deleted_at'); -- true
SELECT to_regclass('public.system_logs') IS NOT NULL; -- true
-- only after window B:
SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='collection_charges' AND column_name='idempotency_key'); -- true
```

API smoke: assign-ticket / update-ticket / create-ticket (session) עדיין עובדים.

---

## 7. מה עדיין לא אומת בחבילה זו

- Apply בפועל לפרוד  
- PostgREST PATCH חי עם JWT משתמש אמיתי (דורש D4)  
- תרגיל restore מלא (P9 / D5)
