# Bamakor — רשימת פריסה / Production checklist

## אימות ואתר (Supabase Auth)

- [ ] **Supabase Site URL** מוגדר לדומיין הפרודקשן (Authentication → URL Configuration)
- [ ] **Supabase Redirect URLs** כולל את הדומיין של Vercel ואת `https://YOUR_DOMAIN/**`
- [ ] `NEXT_PUBLIC_SITE_URL` ב־Vercel תואם לאותו דומיין (כולל `https://`)

## משתני סביבה ב־Vercel

- [ ] כל משתני הסביבה הנדרשים מוגדרים (ראו `.env.example`)
- [ ] `WHATSAPP_APP_SECRET` מוגדר (חתימת webhook) — בדיקה: `GET /api/health` מחזיר `envWarnings: []`
- [ ] `HEALTH_CHECK_SMS_ALERTS` — **לא** להגדיר בפרודקshן (ברירת מחדל: health-check רק ל-`system_logs`, בלי SMS)
- [ ] `WHATSAPP_VERIFY_TOKEN` מוגדר (אימות webhook)
- [ ] `WHATSAPP_ACCESS_TOKEN` / מזהים ב־Supabase `clients` כנדרש לארכיטקטורה שלכם
- [ ] `SMS_API_KEY`, `SMS_SENDER_DEFAULT` או שווה ערך ל־019SMS / ספק SMS
- [ ] `CRON_SECRET` — סוד ל־`/api/cron/*` (Bearer או query `secret`)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` — לשימוש בלבד בצד שרת / API routes

## אינטגרציות חיצוניות

- [ ] **Meta Webhook URL** מעודכן לדומיין החדש (`/api/webhook/whatsapp`)
- [ ] **019SMS** (או ספק תואם) — credentials ושם שולח מאומתים בסביבת פרודקשן

## שמירת נתונים ופרטיות

- [ ] **Data retention policy** מוחלת ב־Supabase (למשל job מתוזמן למחיקת רשומות ישנות לפי המדיניות — ראו `PRIVACY_POLICY_TEMPLATE.md`)
- [ ] **מדיניות פרטיות** זמינה למשתמשי הדשבורד (קישור מתאים בממשק או באתר הציבורי)

## גיבויים

- [ ] **גיבוי Supabase מופעל** (למשל Point-in-Time Recovery / גיבויים אוטומטיים לפי תוכנית)

## ניטור

- [ ] בדיקת **GET `/api/health`** (readiness) מחזירה `status: ok` עם DB מחובר
- [ ] Cron **`/api/cron/health-check`** רץ יומית (06:00 UTC) — לוגים ב-`system_logs` בלבד
- [ ] Cron **`/api/cron/sla-check`** רץ יומית (07:00 UTC) — SMS למנהל, מקס 10 התראות לריצה

## דורש החלטה / גרסה הבאה

- [ ] **Stripe integration** — TODO לגרסה הבאה
- [ ] **Admin super-panel** — TODO לגרסה הבאה

## הפניות

- הגדרות Auth מפורטות בהקשר פרויקט: `DEVELOPER_SUMMARY.md`
- פריטים טכניים ידועים מתוך הקוד: `KNOWN_ISSUES.md`
