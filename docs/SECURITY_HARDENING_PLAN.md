# תוכנית אבטחה — פריסה בטוחה מול דיירים ולקוח משלם

עקרון מנחה: **לא לשבור WhatsApp inbound, סגירת תקלות, SMS, או פורטל עובדים.**  
כל שלב = בדיקות + smoke בפרודקשן לפני הצעד הבא.

מקור מקורי: [#71](https://github.com/YoniLevy10/Bamakor/pull/71) — **לא למזג כמו שהוא.**  
יישום מדורג: branch `cursor/security-hardening-phased-d183` (עם התאמות בטיחות נוספות).

---

## מה כבר סגור (env)

| פריט | סטטוס |
|------|--------|
| `WHATSAPP_APP_SECRET` ב־Vercel (Production + Preview, Sensitive) | מוגדר |
| שאר מפתחות WhatsApp / SMS / Cron / Admin | מוגדרים (ראה `CLAUDE.md`) |

**היגיינה:** לסמן גם את `WHATSAPP_ACCESS_TOKEN` כ־Sensitive ב־Vercel UI.

---

## סטטוס שלבים (קוד)

| שלב | תוכן | סטטוס קוד | פעולת פרודקשן נדרשת |
|-----|------|-----------|---------------------|
| 1 | WhatsApp signature fail-closed + cron Bearer-only + timing-safe secrets | **בקוד** | Smoke WhatsApp + cron אחרי deploy |
| 2 | Headers שמרניים (בלי CSP) + rate-limit memory fallback | **בקוד** | Smoke UI דשבורד / worker / report |
| 3 | Org roles על mutations (null→admin) | **בקוד** | לוודא משתמשי לקוח הם admin/manager |
| 4 | `/api/workers/portal-link` + UI בלי SELECT של token | **בקוד** | Smoke העתקת קישור + SMS |
| 4b | Migration `087` — הסתרת `access_token` מ־PostgREST | **בקובץ בלבד** — **לא** ב־auto-apply | להריץ **ידנית רק אחרי** smoke של 4 |
| 5 | GreenInvoice: timing-safe כשהסוד מוגדר; אם לא מוגדר — עדיין allow | **בקוד (לא שובר)** | להגדיר secret ב־Vercel + Morning כשcollections בשימוש |
| CSP מלא | נדחה במכוון | לא בקוד | Preview נפרד בעתיד |

---

## אחרי merge ל־main — סדר חובה

1. Deploy האפליקציה (שלבים 1–4 בקוד).
2. Smoke checklist (למטה).
3. רק אז: `supabase/migrations/087_workers_hide_access_token.sql` ידנית.
4. Rollback מיידי אם משהו נכשל: revert deploy; ל־087 יש `087_workers_hide_access_token.rollback.sql`.

---

## Smoke checklist (אחרי כל דיפלוי ל־production)

| # | זרימה | איך |
|---|--------|-----|
| 1 | WhatsApp דייר → תקלה חדשה | הודעה אמיתית לדייר בדיקה |
| 2 | סגירת תקלה מדשבורד או עובד | סטטוס נסגר + notify |
| 3 | Worker PWA | רשימת תקלות + כניסה עם `?token=` קיים |
| 4 | העתקת קישור עובד | כפתור בדף עובדים → URL תקין |
| 5 | Cron | רשומה ב־Vercel logs בלי 401 |
| 6 | דשבורד מנהל הלקוח | login + פעולת כתיבה אחת (סגירה/יצירה) |

אם אחד נכשל → **revert מיידי**.

---

## מה לא לעשות

- לא להריץ migration 087 לפני ש־portal-link חי בפרודקשן
- לא לסובב `workers.access_token` של עובדים פעילים
- לא להפעיל CSP מחמיר בלי Preview מלא
- לא להפוך GreenInvoice ל־fail-closed לפני שהסוד מוגדר אצל Morning
