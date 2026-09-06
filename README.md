# Bino Dashboard

**Bino** (Building Intelligence & Operations) — מערכת SaaS רב-דיירית לניהול תקלות ואחזקה בבניינים.

דיירים מדווחים דרך **טופס ציבורי** (`/report`) או **WhatsApp** (סריקת QR לפרויקט).  
מנהל העסק מנהל תקלות, פרויקטים, עובדים ודיירים; מקבל סיכומים, חיוב לפי תוכנית, ויכולות משרד (יומן, שעון נוכחות).  
עובדי שטח עובדים ב**פורטל נפרד** (`/worker`) עם PWA והתראות push.

**סטאק:** Next.js 16 (App Router) · React 19 · TypeScript · Supabase (PostgreSQL + Auth + RLS) · Vercel · Zod · Vitest · Playwright · Sentry · Vercel Analytics / Speed Insights

---

## סביבות עבודה (שני ריפוז)

| תיקייה | ענף | שימוש |
|--------|-----|--------|
| `bino-dashboard-dev` | `develop` | **פיתוח יומי** — יומן, שעון, CI, שיפורי מנהל |
| `bino-dashboard` | `main` | **פרודקשן** — merge ממוקד / hotfix בלבד |

כללי פיתוח (API, SMS, Supabase): `CLAUDE.md`.

**פריסה:** לפי `NEXT_PUBLIC_APP_URL` ב־Vercel. אל תמזגו את כל `develop` ל-`main` לפני בדיקת Preview.

---

## מפת דפים — מנהל (tenant)

| נתיב | תפקיד | גישה |
|------|--------|-------|
| `/login` | כניסה עם Google | ציבורי |
| `/` | לוח בקרה — KPI, תקלות אחרונות, פתיחה מהירה | מחובר |
| `/tickets` | כל התקלות — סינון, Excel, מגירה, מיזוג, מחיקה | מחובר |
| `/projects` | בניינים — יצירה ועריכה (API) | מחובר |
| `/workers` | עובדי שטח — פורטל, SMS, התראות תקלה | מחובר |
| `/residents` | פנקס דיירים — ייבוא Excel, טאב ממתינים | מחובר |
| `/pending-residents` | דיירים שדיווחו וטרם אושרו בפנקס | מחובר |
| `/summary` | דוחות ניהוליים + Excel | מחובר |
| `/calendar` | יומן משרד — חודש/שבוע, iCal, סנכרון Google Calendar | מחובר |
| `/attendance` | חתמת עובדים — NFC, משמרות, דוחות שעות, Excel | מחובר |
| `/qr` | קודי QR לפרויקט (WhatsApp + Web) | מחובר |
| `/settings` | הגדרות — WhatsApp, SMS, push, סדר תפריט, לוגו | מחובר |
| `/settings/whatsapp-templates` | עריכת תבניות הודעות Meta | מחובר |
| `/billing` | תוכנית, מכסות, צריכה חודשית | מחובר |
| `/privacy` | מדיניות פרטיות | ציבורי / מחובר |

**ניווט:** סדר פריטי התפריט נשמר ב-`clients.sidebar_nav_order` (מיגרציה `048`). במובייל — 4 פריטים קבועים בתחתית (בית, תקלות, פרויקטים, עובדים); כפתור «עוד» או תפריט ההמבורגר פותחים את התפריט המלא.

**אבחון פלטפורמה (לא ללקוחות):** דפי `/error-logs`, `/health`, `/system-map` וכו' **הוסרו** — תפעול דרך `/superadmin` + מייל ל-`PLATFORM_OPS_EMAIL`.

---

## דפים ציבוריים ועובד שטח

| נתיב | תפקיד | גישה |
|------|--------|-------|
| `/report` | טופס דיווח לדייר | ציבורי |
| `/worker-login` | כניסת עובד → `/worker?token=` | ציבורי |
| `/worker` | פורטל עובד — תקלות, סטטוסים, צ'אט, סיורים, push | `?token=` / מחובר |
| `/worker/nfc` | החתמת NFC — כניסה/יציאה/ביקור | `?t=` + token עובד |
| `/attendance/scan` | **הוצא משימוש** — מפנה לחתמת NFC | ציבורי (legacy) |

---

## הקמת לקוח חדש — ויזארד מנהל

**נתיב:** `/admin/setup` (מוגן ב-`ADMIN_SETUP_SECRET`)

1. הזנת סוד גישה → טופס (שם חברה, תוכנית, WhatsApp, אימייל מנהל, פרויקטים, עובדים).
2. לחיצה על «הקם לקוח» → יצירת `clients` + `organizations`, הזמנת Auth, פרויקטים עם `qr_identifier`, קישורי QR להעתקה.

בפיתוח: `http://localhost:3000/admin/setup`

---

## הפעלה מקומית

### דרישות

- Node.js 20+ (מומלץ; CI רץ על 20)
- פרויקט Supabase עם **כל המיגרציות** בתיקייה `supabase/migrations/` (עד `049` ומעלה)

### התקנה

```bash
npm install
# העתיקו משתני סביבה מ-Vercel או מלאו ידנית ל-.env.local
npm run dev
```

`http://localhost:3000` · LAN: `npm run dev:lan`

### מיגרציות וטיפוסים

```bash
npm run db:migration:list    # מצב מול Supabase מקושר
npm run db:types             # lib/database.types.ts אחרי שינוי סכמה
```

דפי **יומן** ו-**שעון** דורשים מיגרציות `045`–`047` (ולפחות `048` לסדר תפריט).

---

## משתני סביבה (עיקריים)

| משתנה | תיאור |
|--------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL פרויקט Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | מפתח anon (דפדפן) |
| `SUPABASE_SERVICE_ROLE_KEY` | service role — **שרת בלבד** |
| `NEXT_PUBLIC_APP_URL` | כתובת האפליקציה (קישורים ב-SMS/WhatsApp) |
| `ADMIN_SETUP_SECRET` | סוד ל-`/admin/setup` ו-APIי admin |
| `WHATSAPP_VERIFY_TOKEN` | אימות webhook Meta (GET) |
| `WHATSAPP_ACCESS_TOKEN` | שליחת הודעות (גם נשמר per-tenant ב-DB) |
| `WHATSAPP_PHONE_NUMBER_ID` | מזהה מספר Meta (גם ב-DB) |
| `WHATSAPP_APP_SECRET` | חתימת webhook — **מומלץ בפרודקשן** |
| `SMS_019_USERNAME` / `SMS_019_PASSWORD` | 019SMS |
| `SMS_019_SENDER` | שולח SMS — **חייב** `972xxxxxxxxx` (לא שם טקסט) |
| `CRON_SECRET` | אימות `/api/cron/*` |
| `VAPID_*` / `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Web Push (מנהל + עובד) |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry (production) |
| `BAMAKOR_CLIENT_ID` | fallback ל-client ב-dev |
| `PLATFORM_OPS_EMAIL` / `RESEND_API_KEY` | התראות תפעול פלטפורמה |

> **SMS:** בלי אימוג'י בהודעות. כתיבות ל-`clients` / הגדרות — רק דרך `/api/settings/update` (לא מ-`supabase` בדפדפן).

---

## סקריפטים

| פקודה | תיאור |
|--------|--------|
| `npm run dev` | שרת פיתוח |
| `npm run dev:lan` | פיתוח ברשת מקומית (מובייל) |
| `npm run build` | בניית production |
| `npm run start` | הרצה אחרי build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript |
| `npm test` | Vitest |
| `npm run test:e2e` | Playwright |
| `npm run db:migration:list` | רשימת מיגרציות Supabase |
| `npm run db:types` | יצירת טיפוסי DB |

---

## בדיקות ו-CI

### GitHub Actions

על כל PR: `lint` → `typecheck` → `vitest` → `next build` (`.github/workflows/ci.yml`).

### Vitest

```bash
npm test
```

- `lib/*.test.ts` — לוגיקת WhatsApp, דיירים, dedupe
- `tests/whatsapp-webhook.post.test.ts` — webhook
- `tests/tenant-resolution-fields.test.ts` — regression לשדות `waClient`
- `tests/integration/` — סכמת Supabase (דורש `.env.local` + service role)

### Playwright

```bash
npm run build && npm run start   # בטרמינל נפרד
npm run test:e2e
```

- `tests/e2e/full-coverage.spec.ts` — כיסוי רחב (auth, API, מובייל)
- `tests/e2e/flows.spec.ts` — זרימות ציבוריות ו-admin
- `tests/e2e/dashboard.spec.ts`, `tests/e2e/mobile.spec.ts`

---

## Cron (Vercel)

| Job | תדירות |
|-----|---------|
| `/api/cron/sla-check` | יומי 07:00 UTC |
| `/api/cron/health-check` | יומי 06:00 UTC |
| `/api/cron/whatsapp-retry` | יומי 09:00 UTC |
| `/api/cron/cleanup-webhooks` | שבועי |

---

## תוכניות מחיר

| תוכנית | מחיר/חודש | בניינים | עובדים | תקלות/חודש |
|---------|-----------|---------|--------|------------|
| Starter | ₪299 | 3 | 5 | 300 |
| Pro | ₪499 | 10 | 20 | 1,000 |
| Business | ₪699 | 30 | 60 | 5,000 |
| Enterprise | ₪899+ | ללא הגבלה | ללא הגבלה | ללא הגבלה |

מכסות נאכפות ב-API (יצירת פרויקט/עובד/תקלה); תצוגה ב-`/billing`.

---

## Sentry

`@sentry/nextjs` — `sentry.client.config.ts` / `server` / `edge`.  
פעיל ב-production עם `NEXT_PUBLIC_SENTRY_DSN`.

---

## תיעוד

| קובץ | תוכן |
|------|------|
| `CLAUDE.md` | כללי פיתוח — API, SMS 019, Supabase, env, מובייל |
| `PRIVACY_POLICY_TEMPLATE.md` | מדיניות פרטיות (`/privacy`) |

> **Hydration / SW ישן ב-dev:** DevTools → Application → Service Workers → Unregister, Clear site data.

*עודכן: יוני 2026*
