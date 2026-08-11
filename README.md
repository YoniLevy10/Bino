# Bamakor Dashboard

**במקור (Bamakor)** — מערכת SaaS רב-דיירית לניהול תקלות ואחזקה בבניינים.

דיירים מדווחים דרך **WhatsApp** (סריקת QR) או **טופס ציבורי** (`/report`).  
המשרד מנהל תקלות, בניינים, עובדים ודיירים — ובתוספים: תיבת WhatsApp, חתמת עובדים, גביית ועד ועוד.  
עובדי שטח עובדים ב**פורטל נפרד** (`/worker`) עם PWA, push, וחתמת NFC.

**סטאק:** Next.js 16 (App Router) · React 19 · TypeScript · Supabase (PostgreSQL + Auth + RLS) · Vercel · Zod · Vitest · Playwright · Sentry · Vercel Analytics / Speed Insights

שמות מוצר אחידים: [`docs/GLOSSARY.md`](docs/GLOSSARY.md) · עבודה פתוחה: [`docs/OPEN_WORK.md`](docs/OPEN_WORK.md) · כללי קוד: [`CLAUDE.md`](CLAUDE.md)

---

## ענפים ופריסה

| ענף | שימוש |
|-----|--------|
| `main` | **פרודקשן** — Vercel · מקור האמת |
| `cursor/<נושא>-e95c` | ענפי סוכן / פיצ׳ר → PR ל־`main` |
| `develop` | מיושן לפיתוח יומי — לא לפתוח ממנו פיצ׳רים חדשים |

**פריסה:** `https://bamakor.vercel.app` (`NEXT_PUBLIC_APP_URL`).  
כל PR עובר CI: lint → typecheck → vitest → `next build`.

---

## מפת דפים — מנהל (tenant)

### ליבה

| נתיב | תפקיד | גישה |
|------|--------|-------|
| `/login` | כניסה עם Google | ציבורי |
| `/` | לוח בקרה | מחובר |
| `/tickets` | תקלות — סינון, Excel, מגירה | מחובר |
| `/projects` | בניינים (פרויקטים) | מחובר |
| `/workers` | עובדי שטח | מחובר |
| `/residents` | פנקס דיירים | מחובר |
| `/pending-residents` | דיירים ממתינים לאישור | מחובר |
| `/summary` | דוחות ניהוליים | מחובר |
| `/qr` | קודי QR לפרויקט | מחובר |
| `/settings` | הגדרות tenant | מחובר |
| `/settings/whatsapp-templates` | תבניות WhatsApp | מחובר |
| `/billing` | תוכנית ומכסות | מחובר |
| `/addons` | קטלוג תוספים | מחובר |
| `/privacy` | מדיניות פרטיות | ציבורי / מחובר |

### תוספים (מופעלים בסופר־אדמין / billing)

| נתיב | שם מוצר |
|------|---------|
| `/whatsapp-inbox` | תיבת WhatsApp |
| `/attendance` | חתמת עובדים (NFC) |
| `/collections` | גביית ועד (Morning) |
| `/calendar` | יומן משרד |
| `/professionals` | אנשי מקצוע |
| `/pilot-sms` | SMS פיילוט לדיירים |
| `/project-documents` | תיקיית מסמכים |
| `/campaigns` | קמפיינים SMS |

**ניווט:** סדר תפריט ב־`clients.sidebar_nav_order`. במובייל — 4 פריטים קבועים בתחתית (בית, תקלות, פרויקטים, עובדים). תוספים שלא בסיידבר נגישים מ־`/addons`.

**תפעול פלטפורמה:** `/superadmin` (+ מייל ל־`PLATFORM_OPS_EMAIL`). לא לחשוף דפי אבחון ללקוחות.

---

## דפים ציבוריים ועובד שטח

| נתיב | תפקיד | גישה |
|------|--------|-------|
| `/report` | טופס דיווח לדייר | ציבורי |
| `/intake` | קליטת דיירים / שיתוף | ציבורי לפי הגדרות |
| `/pay/...` | דפי תשלום לדייר (גבייה) | ציבורי (token) |
| `/for-managers` | דף שיווק למנהלים | ציבורי (כשמוזג) |
| `/worker-login` | כניסת עובד → `/worker?token=` | ציבורי |
| `/worker` | פורטל עובד | `?token=` |
| `/worker/nfc` | חתמת NFC — כניסה/יציאה/ביקור | `?t=` + token עובד |
| `/attendance/scan` | **הוצא משימוש** → NFC | legacy |

תפעול חתמת: [`docs/RUNBOOKS.md`](docs/RUNBOOKS.md).

---

## הקמת לקוח חדש

**נתיב:** `/admin/setup` (מוגן ב־`ADMIN_SETUP_SECRET`) — או דרך `/superadmin`.

1. סוד גישה → טופס (חברה, תוכנית, WhatsApp, מנהל, פרויקטים, עובדים).
2. יצירת `clients` + `organizations`, הזמנת Auth, QR לפרויקטים.

---

## הפעלה מקומית

### דרישות

- Node.js 20+
- פרויקט Supabase עם מיגרציות מ־`supabase/migrations/` (כרגע עד `087` ומעלה)

### התקנה

```bash
npm install
# העתיקו משתני סביבה מ-Vercel או מלאו .env.local
npm run dev
```

`http://localhost:3000` · LAN: `npm run dev:lan`

```bash
npm run db:migration:list
npm run db:types             # אחרי שינוי סכמה
```

---

## משתני סביבה (עיקריים)

| משתנה | תיאור |
|--------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL פרויקט Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | מפתח anon (דפדפן) |
| `SUPABASE_SERVICE_ROLE_KEY` | service role — **שרת בלבד** |
| `NEXT_PUBLIC_APP_URL` | כתובת האפליקציה (קישורים ב-SMS/WhatsApp) |
| `ADMIN_SETUP_SECRET` | סוד ל-admin / setup |
| `WHATSAPP_VERIFY_TOKEN` | אימות webhook Meta |
| `WHATSAPP_ACCESS_TOKEN` | שליחת הודעות (גם per-tenant ב-DB) |
| `WHATSAPP_PHONE_NUMBER_ID` | מזהה מספר Meta (גם ב-DB) |
| `WHATSAPP_APP_SECRET` | חתימת webhook — מומלץ בפרודקשן |
| `SMS_019_USERNAME` / `SMS_019_PASSWORD` | 019SMS |
| `SMS_019_SENDER` | שולח — **חייב** `972xxxxxxxxx` |
| `CRON_SECRET` | אימות `/api/cron/*` |
| `VAPID_*` / `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Web Push |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry |
| `BAMAKOR_CLIENT_ID` | fallback client ב-dev |
| `PLATFORM_OPS_EMAIL` / `RESEND_API_KEY` | התראות תפעול |

פירוט מלא + חוסרים: `CLAUDE.md`.

> **SMS:** בלי אימוג'י. כתיבות ל־`clients` — רק דרך `/api/settings/update`.

---

## סקריפטים

| פקודה | תיאור |
|--------|--------|
| `npm run dev` | שרת פיתוח |
| `npm run dev:lan` | פיתוח ברשת מקומית |
| `npm run build` / `npm run start` | production |
| `npm run lint` / `npm run typecheck` | בדיקות סטטיות |
| `npm test` | Vitest |
| `npm run test:e2e` | Playwright |
| `npm run db:migration:list` | מיגרציות |
| `npm run db:types` | טיפוסי DB |

---

## בדיקות ו-CI

על כל PR: `lint` → `typecheck` → `vitest` → `next build` (`.github/workflows/ci.yml`).

```bash
npm test
npm run build && npm run start   # טרמינל נפרד
npm run test:e2e
```

---

## Cron (Vercel)

| Job | תדירות |
|-----|---------|
| `/api/cron/sla-check` | יומי |
| `/api/cron/health-check` | יומי |
| `/api/cron/whatsapp-retry` | יומי |
| `/api/cron/cleanup-webhooks` | שבועי |
| `/api/cron/attendance-*` | חתמת עובדים — ראו RUNBOOKS |

---

## תוכניות מחיר

| תוכנית | מחיר/חודש | בניינים | עובדים | תקלות/חודש |
|---------|-----------|---------|--------|------------|
| Starter | ₪299 | 3 | 5 | 300 |
| Pro | ₪499 | 10 | 20 | 1,000 |
| Business | ₪699 | 30 | 60 | 5,000 |
| Enterprise | ₪899+ | ללא הגבלה | ללא הגבלה | ללא הגבלה |

מכסות ב-API; תצוגה ב־`/billing`. תוספים בתשלום — `/addons` + סופר־אדמין.

---

## תיעוד

| קובץ | תוכן |
|------|------|
| [`docs/GLOSSARY.md`](docs/GLOSSARY.md) | שמות מוצר אחידים (עברית + קוד) |
| [`docs/OPEN_WORK.md`](docs/OPEN_WORK.md) | PRs / ענפים פתוחים ולמה |
| [`docs/RUNBOOKS.md`](docs/RUNBOOKS.md) | תפעול חתמת NFC וכו׳ |
| [`CLAUDE.md`](CLAUDE.md) | כללי פיתוח — API, SMS, Supabase, env |
| `PRIVACY_POLICY_TEMPLATE.md` | מדיניות פרטיות |

> **Hydration / SW ישן ב-dev:** DevTools → Application → Service Workers → Unregister.

*עודכן: אוגוסט 2026*
