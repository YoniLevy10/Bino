# Bamakor Dashboard

**במקור (Bamakor)** היא מערכת SaaS רב-דיירית לניהול תקלות ואחזקה בבניינים.  
דיירים מדווחים דרך **טופס ציבורי** (`/report`) או **WhatsApp** (סריקת QR לפרויקט).  
בעל העסק מנהל תקלות, עובדים, דיירים, ומקבל סיכומים ודוחות.

**סטאק טכני:** Next.js 16 (App Router) · React 19 · TypeScript · Supabase (PostgreSQL + Auth + RLS) · Vercel · Zod · Vitest · Playwright · Sentry · Vercel Analytics · Vercel Speed Insights

---

## מפת הדפים — מה כל דף עושה

| נתיב | תפקיד | גישה |
|------|--------|-------|
| `/login` | כניסה עם Google בלבד | ציבורי |
| `/` | לוח בקרה ראשי — KPI, תקלות אחרונות, פתיחת תקלה חדשה | מחובר |
| `/tickets` | כל התקלות — סינון, חיפוש, ייצוא Excel, מגירת פרטים | מחובר |
| `/projects` | בניינים/פרויקטים — יצירה, עריכה, ניהול | מחובר |
| `/workers` | עובדי שטח — הוספה, עריכה, שיוך לתקלות | מחובר |
| `/residents` | דיירים — ייבוא Excel, הוספה ידנית | מחובר |
| `/pending-residents` | דיירים שדיווחו ועדיין לא נרשמו בפנקס | מחובר |
| `/qr` | קודי QR להדפסה לכל פרויקט (WhatsApp + Web) | מחובר |
| `/summary` | דוחות ניהוליים + ייצוא Excel | מחובר |
| `/billing` | תוכנית פעילה, צריכה החודשית, גרף שבועי | מחובר |
| `/settings` | הגדרות WhatsApp, דחיפות, תבניות הודעות | מחובר |
| `/error-logs` | יומן שגיאות פנימי לצוות תמיכה | מחובר |
| `/onboarding` | הגדרה ראשונה למשתמש חדש (ארגון → פרויקט → עובד) | מחובר (חדש) |
| `/report` | טופס דיווח ציבורי לדיירים | ציבורי |
| `/worker` | מסך עובד שטח — צפייה ועדכון תקלות משויכות | ציבורי (`?token=`) / מחובר |
| `/admin/setup` | **ויזארד פנימי** — הקמת לקוח חדש בדקה אחת | פנימי (`ADMIN_SETUP_SECRET`) |

---

## 🚀 הקמת לקוח חדש — ויזארד מנהל (פחות מדקה!)

### איפה זה?
**`https://app.bamakor.com/admin/setup`** (או `http://localhost:3000/admin/setup` בפיתוח)

### איך עושים את זה?

**שלב 1 — פתיחה:**
גלוש ל-`/admin/setup`. יופיע מסך נעילה עם שדה סיסמה.

**שלב 2 — קוד גישה:**
הזן את ה-`ADMIN_SETUP_SECRET` שהגדרת ב-Vercel → לחץ "כניסה".

**שלב 3 — מלא את הטופס:**

| שדה | מה להזין | חובה |
|-----|----------|-------|
| שם החברה | שם הלקוח/ועד הבית | ✅ |
| תכנית | Starter / Pro / Business / Enterprise | ✅ |
| WhatsApp Phone Number ID | ה-ID מ-Meta Business Manager | לא |
| מספר WhatsApp Business | הספרות שדיירים שולחים אליהן הודעה (ללא +) | לא |
| אימייל מנהל | ישלח הזמנה אוטומטית ל-Supabase | ✅ |
| טלפון מנהל | לצורך fallback בהודעות | לא |
| פרויקטים | שם + קוד (PROJ1) + כתובת — לחץ "+ הוסף פרויקט" לכל בניין | ✅ לפחות 1 |
| עובדים | שם מלא + טלפון + אימייל + תפקיד | לא |

**שלב 4 — לחץ "הקם לקוח"**

המערכת תיצור אוטומטית:
- ✅ שורת `clients` + `organizations` ב-DB
- ✅ הזמנה לאימייל המנהל (Supabase Auth) — ישקבל מייל עם לינק כניסה
- ✅ פרויקטים עם `qr_identifier = START_{PROJECT_CODE}`
- ✅ עובדים רשומים ומוכנים לשיוך

**שלב 5 — תוצאות:**
תוצג טבלה עם כל הפרויקטים + **קישורי QR מוכנים** — WhatsApp וכניסה ישירה.

```
פרויקט    | קוד    | WhatsApp QR              | קישור דיווח
ועד הבית  | VAAD1  | https://wa.me/972...     | https://app.../report?project=VAAD1
גן הורדים | GARDEN | https://wa.me/972...     | https://app.../report?project=GARDEN
```

> **טיפ:** לחץ על 📋 ליד קישור הדיווח כדי להעתיקו ישירות.

---

## הפעלה מקומית

### דרישות

- Node.js 18+
- פרויקט Supabase עם מיגרציות מהריפו (`supabase/migrations/`)

### צעדים

```bash
npm install
cp .env.example .env.local   # והשלמת ערכים (ראו רשימה למטה)
npm run dev
```

השרת על `http://localhost:3000`.  
**ויזארד:** http://localhost:3000/admin/setup

### משתני סביבה נדרשים

| משתנה | תיאור |
|--------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL פרויקט Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon key ציבורי |
| `SUPABASE_SERVICE_ROLE_KEY` | service role key (שרת בלבד!) |
| `NEXT_PUBLIC_APP_URL` | כתובת האפליקציה (למשל `https://app.bamakor.com`) |
| `ADMIN_SETUP_SECRET` | סיסמה לוויזארד הקמת לקוח חדש |
| `WHATSAPP_VERIFY_TOKEN` | טוקן אימות Webhook של Meta |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Web Push (אופציונלי) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | זהה ל-VAPID_PUBLIC_KEY |
| `NEXT_PUBLIC_SENTRY_DSN` | DSN מ-Sentry.io (ניטור שגיאות, אופציונלי) |
| `SMS_019_API_TOKEN` / `SMS_019_USERNAME` | אישורי 019SMS לשליחת SMS לפועלים ומנהלים |
| `MANAGER_PHONE` | מספר טלפון ברירת מחדל למנהל (override per-project) |

---

## סקריפטים שימושיים

| פקודה | תיאור |
|--------|--------|
| `npm run dev` | שרת פיתוח |
| `npm run build` | בניית production |
| `npm run start` | הרצה אחרי build |
| `npm run typecheck` | בדיקת TypeScript ללא פלט |
| `npm test` | Vitest (unit + integration) |
| `npx playwright test` | בדיקות E2E (דורש `npm run build && npm run start` לפני) |
| `npx playwright test tests/e2e/flows.spec.ts` | בדיקות E2E — זרימות משתמש מלאות |

---

## בדיקות

### Unit + Integration (Vitest)
```bash
npm test
```
- `lib/*.test.ts` — בדיקות יחידה
- `tests/integration/` — 122 בדיקות נגד Supabase בפועל (דורש `.env.local` עם service role)

### E2E (Playwright)
```bash
npx playwright test
```
- `tests/e2e/full-coverage.spec.ts` — **85+ בדיקות** המכסות את כל הזרימות: ויזארד admin, כפתורים, forms, API security, redirect auth, מובייל
- `tests/e2e/flows.spec.ts` — בדיקות ציבוריות, הפניות, health, admin API security
- `tests/e2e/dashboard.spec.ts` — לוח בקרה
- `tests/e2e/mobile.spec.ts` — תצוגת מובייל

---

## תוכניות מחיר

| תוכנית | מחיר/חודש | בניינים | עובדים | תקלות/חודש |
|---------|-----------|---------|--------|------------|
| Starter | ₪299 | 3 | 5 | 300 |
| Pro | ₪499 | 10 | 20 | 1,000 |
| Business | ₪699 | 30 | 60 | 5,000 |
| Enterprise | ₪899+ | ללא הגבלה | ללא הגבלה | ללא הגבלה |

---

## ניטור שגיאות — Sentry

הפרויקט משתמש ב-**Sentry** לניטור שגיאות בייצור.  
הגדרות: `sentry.client.config.ts` · `sentry.server.config.ts` · `sentry.edge.config.ts`  
**פעיל רק ב-`NODE_ENV=production`** (לא ב-dev).  
להפעלה: הוסף `NEXT_PUBLIC_SENTRY_DSN` ב-Vercel מתוך [sentry.io](https://sentry.io).

---

## תיעוד נוסף

- **`DEVELOPER_SUMMARY.md`** — ארכיטקטורה, RLS, מפת דפים מלאה (מקור טכני מפורט)
- **`DEPLOYMENT_CHECKLIST.md`** — פריסת production, משתני סביבה, אינטגרציות ופרטיות
- **`KNOWN_ISSUES.md`** — TODO/FIXME/HACK מתועד מהקוד
- **`PRIVACY_POLICY_TEMPLATE.md`** — תבנית למדיניות פרטיות

> **Hydration errors** בסביבת dev? ניקוי Service Worker ישן (DevTools → Application → Service Workers → Unregister + Clear site data).
