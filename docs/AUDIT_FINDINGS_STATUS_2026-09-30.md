# סטטוס ממצאי ביקורת 01–52 (ענף תיקון)

מקור: `docs/BINO_Read_Only_Audit_HE_2026-09-30.md`  
החלטות ריצה: תיקונים על `main`; מיגרציות ב־PR בלבד (ללא apply ל־Bamakor); מעבר אבטחה לפורטל דיירים על הקוד שכבר ממוזג.

| מזהה | סטטוס | ראיות / קבצים |
|---|---|---|
| 01 | תוקן | `middleware.ts` — `/api/create-ticket` ציבורי |
| 02 | תוקן | `middleware.ts` — `/api/webhook/fixly` |
| 03 | תוקן | `middleware.ts` — `/api/webhook/document-sign` |
| 04 | תוקן | `lib/api-auth.ts` `requireSessionWriteAccess` + המרת נתיבי כתיבה |
| 05 | תוקן | `lib/tenant-owned-refs.ts` + `maintenance-tasks` |
| 06 | תוקן | `update-ticket` + `assertWorkerOwnedByClient` |
| 07 | מיגרציה ב־PR (חסום apply) | `111_audit_whatsapp_phone_unique_and_rls_writes.sql` — REVOKE writes; נדרש apply ידני |
| 08 | תוקן | `lib/middleware-tenant-cache.ts` HMAC + דחיית ts עתידי; בדיקות |
| 09 | תוקן | `listClientIdsForUserId` מסנן `is_active` |
| 10 | חסום / מוצר | מודל superadmin גלובלי — דורש החלטת זהות MFA; לא הוחלש |
| 11 | תוקן | WhatsApp fail-closed ב־production בלי secret |
| 12 | תוקן | 503 על כשל עיבוד; dispatch זורק שגיאה |
| 13 | תוקן | מחיקת `processed_webhooks` אחרי כשל |
| 14 | תוקן | `parseAllIncomingWhatsAppMessages` |
| 15 | תוקן בקוד + מיגרציה | refusal על עמימות; UNIQUE index ב־111 |
| 16 | חלקי | לא נגע ב־cron preventive מעבר לתזמון + בדיקת תוצאת שליחה נדרשת בהמשך |
| 17 | תוקן | Approve לפני mark paid ב־`grow/route.ts` |
| 18 | תוקן | בדיקת `error` ב־select/update Grow helpers |
| 19 | תוקן | sumRejected בלי persist/Approve |
| 20 | תוקן | update מותנה בסטטוס צפוי |
| 21 | חסום חיצוני | נדרש סנדבוקס Grow לאימות כפל wallet; נעילה מקומית חלקית בלבד |
| 22 | חלקי / חיצוני | ביטול מקומי + סירוב paid ל־cancelled; ביטול קישור ב־Grow דורש API ספק |
| 23 | תוקן | resend חוסם paid תמיד |
| 24 | תוקן | invoice webhook קורא `customFields.cField1` |
| 25 | פתוח | idempotency מול Resend — לא יושם במלואו |
| 26 | פתוח | אין cron retry לאישורים — נותר פער |
| 27 | חסום מוצר | SMS חשבונית — Grow עשוי לשלוח; לא נוסף מסלול BINO SMS |
| 28 | תוקן | `Idempotency-Key` + מיגרציה 113 |
| 29 | פתוח | bulk 500 עדיין סינכרוני — דורש job durable |
| 30 | תוקן | חיפוש חיובים ב־DB |
| 31 | פתוח | summary/delete_all pagination מלא |
| 32 | פתוח | retry-approve types |
| 33 | תוקן | `parseGrowEnv` דוחה ערכים עמומים |
| 34 | תוקן | תור לפי `worker_id` + ניקוי ב־logout |
| 35 | תוקן | באצ׳ים של 50 ב־`sync-attendance` |
| 36 | תוקן | כיבוד `event_type` מהלקוח |
| 37 | תוקן | כשל עדכון משמרת → conflict |
| 38 | תוקן | חוסר קואורדינטות ב־geofence → pending_review |
| 39 | פתוח | tour defect סדר ולידציה |
| 40 | תוקן + מיגרציה | soft-delete פרויקט; מיגרציה 112 |
| 41 | תוקן | query key כולל limit |
| 42 | תוקן | `TenantAuthSync` מנקה React Query |
| 43 | תוקן | חיפוש בניינים ב־DB |
| 44 | פתוח | pagination משימות 300 |
| 45 | פתוח | סדר דיירים יציב |
| 46 | תוקן | באנר 200 |
| 47 | פתוח | multipart max length |
| 48 | חלקי | middleware פתוח ל־create-ticket; E2E live עדיין דורש `E2E_LIVE_SUPABASE` |
| 49 | תוקן | cron preventive ב־`vercel.json` |
| 50 | תוקן | rate limit fail-closed |
| 51 | מוצר | חתימה ידנית — תועד; webhook שוחרר מ־middleware |
| 52 | תוקן | `clientHasPaidAddon` בודק catalog `is_active` |

## תוכן שנמחק / עודכן

| פריט | פעולה | סיבה |
|---|---|---|
| `docs/GROW_INTEGRATION_AUDIT_2026-09-28.md` | נמחק | דוח נקודתי ישן; הוחלף ב־PAYMENTS/COLLECTIONS_GO_LIVE |
| `docs/PERFORMANCE_AUDIT_SUPABASE.md` | נמחק | טענות מיושנות (אין React Query) |
| `README.md` | עודכן | ריפו יחיד, דפים חסרים, תאריך |
| `docs/SEO.md` | עודכן | guides ships |
| `docs/OPSBRAIN_DEMO.md` | עודכן | הסרת סיסמה בטקסט גלוי |
| `public/llms.txt` | עודכן | `/guides`, `/vaad-pay` |
| `app/robots.ts` | עודכן | disallow `/resident` |
