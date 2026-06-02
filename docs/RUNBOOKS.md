# Runbooks — Bamakor

## SMS 019 — status 515 (שולח לא תקין)

- **סימפטום:** HTTP 200 מ-019 אבל XML status 515; SMS לא נשלח אחרי 3 retries.
- **סיבה:** `from` אינו מספר `972xxxxxxxxx` (שם אלפביתי או sender לא רשום).
- **פתרון:** `SMS_019_SENDER` / `sms_sender_name` ב-DB = null או מספר טלפון מאושר בלבד. ראה `CLAUDE.md`.

## Webhook WhatsApp — 403

- **סימפטום:** Meta מחזיר שגיאה או `GET /api/health` מציג `WHATSAPP_APP_SECRET` ב-`envWarnings`.
- **פתרון:** הגדר `WHATSAPP_APP_SECRET` ב-Vercel; וודא `WHATSAPP_VERIFY_TOKEN` תואם ל-Meta.

## כתיבה מהדפדפן "לא עובדת"

- **סימפטום:** לחיצת שמירה ללא שגיאה אבל הנתונים לא משתנים.
- **סיבה:** RLS חוסם writes מ-`supabase` בצד לקוח.
- **פתרון:** כל mutation חייב לעבור דרך `/api/*` עם `getSupabaseAdmin()`.

## Cron נכשל

- **בדיקה:** `system_logs` ב-Supabase; לוגי Vercel ל-`/api/cron/*`.
- **אימות:** `CRON_SECRET` ב-query או Bearer.
