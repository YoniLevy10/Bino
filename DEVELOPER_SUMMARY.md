# תמונת מצב מלאה — branch main

מסמך זה מתאר את המערכת כפי שהיא בקוד ב־branch **main** (מאי 2026). יש לעדכן אותו כשמתווספים מודולים או מדיניות RLS משמעותית.

**עדכון אחרון — 10 מאי 2026 — Sprint "Pre-Launch Polish + Analytics":**

- **תיקון כפל דייר מוואטסאפ (`/api/pending-residents` PATCH):** הוספת pre-check לפני INSERT, auto-reject של הבקשה הממתינה כשמספר הטלפון כבר קיים, ו-handling ספציפי של `idx_residents_client_phone_unique` (מחזיר 400 במקום 500).
- **תיקון SMS לפועלים (`lib/sms-send.ts`):** `sendWorkerSMS` לא נרמל את מספר הטלפון לפני שליחה (בניגוד ל-`sendManagerSMS`). תוקן: strip של `+`/רווחים, המרת `05x` ל-`972x`.
- **TicketChat tabs (`TicketDetailDrawer`):** הצ'אט הפנימי עבר ל-tab נפרד "פרטים / צ'אט פנימי" כדי שיהיה נגיש מיד בלי גלילה.
- **Vercel Analytics:** `@vercel/analytics` הותקן; `<Analytics />` נוסף ל-`app/layout.tsx` לצד `<SpeedInsights />`.
- **E2E tests — 123/123 ✅:** כל הטסטים עברו לירוק. תוקנו: middleware מחזיר 401 JSON ל-API routes במקום redirect ל-login; `/admin/setup` ו-`/api/health` עקפים ב-middleware; טסטים של dashboard ומובייל עוצבו מחדש לבדיקת ה-login redirect.

---

**Speed Insights (Desktop · 10 מאי 2026) — נדרש שיפור:**

| מדד | ציון | סטטוס |
|-----|------|--------|
| TTFB | 3.21s | 🔴 גרוע |
| FCP | 3.73s | 🔴 גרוע |
| LCP | 4.32s | 🔴 גרוע |
| INP | 80ms | 🟢 טוב |
| CLS | 0.01 | 🟢 מצוין |
| FID | 4ms | 🟢 טוב |
| **RES** | **71** | **🟡 Needs Improvement** |

**עמודים בעייתיים:** `/superadmin` (58), `/` (63), `/settings` (65). 
**סיבה עיקרית:** TTFB גבוה — Supabase queries בכל SSR + Vercel cold starts.  
**פעולות מומלצות לשיפור ביצועים:** הוספת `Cache-Control` לתשובות API שלא משתנות לעתים קרובות; שקלול React Server Components להפחתת JS ב-client; הגדרת Vercel ISR על דפי dashboard סטטיים; בחינת Edge Runtime ל-middleware.

---

**עדכון קודם (מאי 2026) — Sprint "Foundation Hardening + Admin Tooling":**

- **ויזארד הקמת לקוח חדש (`/admin/setup`):** טופס פנימי מאובטח (ADMIN_SETUP_SECRET) — מקים clients → organizations → auth invite → organization_users → projects → workers בלחיצה אחת. API: `POST /api/admin/setup-client`. מחזיר קישורי QR מוכנים לכל פרויקט.
- **Sentry:** `sentry.{client,server,edge}.config.ts` + `withSentryConfig` ב-next.config.ts. פעיל רק ב-production. DSN מ-`NEXT_PUBLIC_SENTRY_DSN`.
- **Tickets pagination:** `.limit(300)` על שאילתת התקלות + באנר אזהרה אם הגיעו ל-300.
- **4 מסלולי מחיר:** starter(₪299) / pro(₪499) / business(₪699) / enterprise(₪899+). מיגרציה 035 — CHECK constraint + normalizeTier().
- **Soft delete:** מיגרציה 034 — `deleted_at` על tickets/workers/residents.
- **Integration tests:** 122 בדיקות נגד Supabase חי (`tests/integration/supabase-schema.integration.test.ts`).
- **E2E tests:** 85+ בדיקות Playwright (`tests/e2e/full-coverage.spec.ts`) — כיסוי כל זרימות המשתמש עד לרמת הכפתור.
- **Auth / login:** `/login` — Google בלבד (`app/login/login-client.tsx`), `redirectTo: <origin>/auth/callback` (ללא אימייל/סיסמה).  
- **PWA:** `public/manifest.json`, `public/sw.js` (**גרסת מטמון v2**: Network First ל־HTML, Cache First לנכסים סטטיים, מחיקת מטמונים ישנים, `public/offline.html`), אייקונים ו־metadata מבוססים על **`/apple-icon.png`**, רישום SW ב־`RegisterServiceWorker` (`app/layout.tsx`).  
  - **פיתוח (Dev):** ה־Service Worker **לא נרשם** (כדי למנוע cache של HTML/JS שיוצר Hydration mismatch / "נדרש התחברות"). אם כבר נרשם בעבר — להסיר ב־DevTools → Application → Service Workers → Unregister + Clear site data.  
- **עובד שטח:** `workers.access_token` (מיגרציה 024); `/worker?token=` ציבורי (ללא Google); `GET /api/worker-auth`, `GET/PATCH /api/worker/tickets`; מסך עובדים — כפתור **העתק קישור**.  
- **Rate limiting ציבורי:** טבלת `rate_limits` + RPC `bamakor_rate_limit_ip_endpoint` — עד **20 בקשות לדקה לכל IP** ל־`GET /api/public/projects` ול־`POST /api/create-ticket` (דיווח ציבורי בלבד); תשובת 429: `יותר מדי בקשות, נסה שוב בעוד דקה`.  
- **Billing:** טבלת `billing_events` + טריגרים על INSERT ל־`tickets` / `residents` / `workers`; דף **`/billing`** + `GET /api/billing/summary`; קישור תחת **הגדרות** בניווט.  
- **ייצוא Excel:** `/tickets` — כפתור **ייצוא Excel** לרשימה המסוננת (`xlsx`), שם קובץ `bamakor-tickets-<תאריך>.xlsx`, כותרות בעברית.  
- **Web Push:** טבלת `push_subscriptions`, `POST /api/push/subscribe`, `lib/push-notifications.ts` (אחרי יצירת תקלה ב־`/api/create-ticket`), הגדרות — **הפעל התראות**; env: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, ובצד לקוח גם **`NEXT_PUBLIC_VAPID_PUBLIC_KEY`** (אותו ערך כמו הציבורי).  
- **QR / דיווח ציבורי / Webhook:** כבסעיף הקודם — מיגרציה 023; webhook עם `after()`; תבניות 60 שניות.
- **תפריט / ניווט (אחידות):** `app/components/ui.tsx` — סדר פריטים אחיד (לוח בקרה, תקלות, פרויקטים, דיירים, דיירים לאישור, קודי QR, יומן שגיאות, תבניות וואטסאפ, סיכום) + **"הגדרות" בתחתית בלבד**; ב־Mobile Bottom Nav — פריטים ברוחב אחיד עם גלילה ו"הגדרות" קבוע בצד.  
- **Hydration mismatch:** ה־Sidebar לא נרנדר ב־SSR (רק אחרי mount) כדי להימנע מ־SSR/HMR mismatch ב־Dev (בעיקר עם SW/cache).  
- **מיגרציה 025:** תיקון ייחודיות טלפון עובדים — `UNIQUE (phone, client_id)` (במקום ייחודי גלובלי).  
- **מיגרציה 026:** Seed תבניות WhatsApp דיפולטיביות לכל לקוח, *רק אם* טבלת `whatsapp_templates` ריקה.  
- **Onboarding `/api/create-worker` 500:** לוגים מפורטים + הודעת שגיאה ברורה כאשר `SUPABASE_SERVICE_ROLE_KEY` חסר.

---

## 1. ארכיטקטורה

### זרימה כללית

1. **משתמש** נכנס דרך דפדפן (Next.js App Router, React 19, רכיבי UI עם inline styles ו־`theme`).
2. **אימות (Auth)**  
   - התחברות: **Google OAuth** דרך `supabase.auth.signInWithOAuth` בדף `/login`.  
   - אחרי Google, Supabase מפנה ל־**`/auth/callback`** עם `?code=` — שרת Next מריץ `exchangeCodeForSession` ומגדיר עוגיות סשן (`@supabase/ssr`).  
   - **Middleware** (`middleware.ts`) קורא `getUser()`; אם אין משתמש — הפניה ל־`/login?redirectTo=...` (יוצאים מחוץ לחסימה: `/report`, `/worker`, `/api/worker-auth`, `/api/worker/*`, `/api/public/*`, `/offline.html`, וכו').  
   - משתמש חדש (נרשם ב־30 הימים האחרונים) **ללא פרויקטים פעילים** עבור ה־`client_id` שלו (מזהה דרך `organization_users` → `organizations.client_id`) — הפניה ל־`/onboarding`.
3. **Frontend (דפים Client)**  
   - רוב הדפים משתמשים ב־`lib/supabase` (מקליינט דפדפן עם anon key) לשאילתות ישירות לטבלאות (בהנחת RLS/מדיניות שמאפשרת ל־`authenticated` או anon לפי המיגרציות).  
   - `resolveBamakorClientIdForBrowser()` ב־`lib/bamakor-client.ts`: `getUser()` → `organization_users` → `organizations.client_id`; אם אין שיוך — מעבר ל־`/onboarding`. ב־**development** בלבד fallback ל־`NEXT_PUBLIC_BAMAKOR_CLIENT_ID` כשאין `client_id` לארגון.
4. **API Routes** (`app/api/**/route.ts`)  
   - פעולות רגישות משתמשות ב־**Service Role** (`lib/supabase-admin.ts`) כדי לעקוף RLS כשצריך.  
   - נתיבי דשבורד מאומתים ב־`requireSessionClientId()` (`lib/api-auth.ts`): סשן → `getSingletonClientId(admin, user.id)` שבפועל קורא ל־`requireClientIdForUser` ב־`lib/tenant-resolution.ts` (שרשרת org → client). דיווח ציבורי ב־`/report` שולח `client_id` בגוף הבקשה ל־`/api/create-ticket` (בנוסף ל־`project_code`). Webhook וואטסאפ: `resolveClientIdByWhatsAppPhoneNumberId` לפי `whatsapp_phone_number_id`.
5. **Supabase**  
   - DB + Auth + (אופציונלי) Realtime.  
   - Webhook וואטסאפ: `POST /api/webhook/whatsapp` — ללא סשן משתמש; מזהה לקוח לפי `whatsapp_phone_number_id` בטבלת `clients` (עם fallback dev ל־`BAMAKOR_CLIENT_ID`).
6. **PWA (התקנה במכשיר)**  
   - `public/manifest.json`, `public/sw.js` (מטמון `bamakor-v2`), רישום SW ב־`RegisterServiceWorker` (`app/layout.tsx`).  
   - **לוגו ואייקונים:** **`public/apple-icon.png`** (דף התחברות, metadata, manifest, OG/Twitter).  
   - **Offline:** דף `public/offline.html`; ב־SW — ניווטים Network First, נכסים סטטיים Cache First, `push` + `notificationclick` להתראות דחיפה.

### איך `client_id` עובר בבקשות

| שכבה | מנגנון |
|--------|--------|
| דפדפן | `resolveBamakorClientIdForBrowser()` → מזהה `clients.id` לפי שיוך ארגון; מזריק ל־`.eq('client_id', …)` בשאילתות מהדפים. |
| שרת API (דשבורד) | `requireSessionClientId()` → `client_id` לפי משתמש; כל שאילתת admin מסננת לפי אותו `client_id`. |
| דיווח ציבורי | `GET /api/public/projects` (רשימה/חיפוש לפי `client_id`); `POST /api/create-ticket` עם `client_id` בטופס (`?client=` ב־`/report`). |
| Webhook וואטסאפ | `resolveClientIdByWhatsAppPhoneNumberId` — לא עובר `client_id` מהדפדפן. |
| Cron | לפי `client_id` בשורות (תקלות / `error_logs`) — ללא singleton גלובלי. |

### איך Auth מחובר לדפים

- **Middleware** חוסם כל נתיב (מלבד public) בלי משתמש מחובר.  
- דפים לא קוראים ידנית ל־`getSession` בכל כניסה — ההנחה היא שהעוגיות כבר אחרי OAuth.  
- **יציאה:** כפתור **"יציאה מהחשבון"** בסיידבר ובתפריט המובייל (`NavSignOutButton` ב־`app/components/ui.tsx`) — `signOut()` + מעבר ל־`/login`.

---

## 2. מפת דפים

| נתיב | תפקיד | גישה | סטטוס |
|------|--------|--------|--------|
| `/` | לוח בקרה, KPI, תקלות אחרונות, מגירת תקלה | משתמש מחובר | ✅ |
| `/login` | התחברות Google בלבד; לוגו `apple-icon.png` | ציבורי | ✅ |
| `/auth/callback` | החלפת קוד OAuth לסשן (שרת) | ציבורי (לא חוסם middleware) | ✅ |
| `/onboarding` | יצירת ארגון / פרויקט / עובד ראשוני למשתמש חדש | משתמש מחובר | ✅ |
| `/tickets` | רשימת תקלות, סינון, ייצוא, מגירות | משתמש מחובר | ✅ |
| `/projects` | פרויקטים, עריכה, מגירות | משתמש מחובר | ✅ |
| `/workers` | עובדים | משתמש מחובר | ✅ |
| `/residents` | דיירים, ייבוא, מודלים | משתמש מחובר | ✅ |
| `/qr` | קודי QR לפרויקטים | משתמש מחובר | ✅ |
| `/settings` | התראות, וואטסאפ, קישור לתבניות | משתמש מחובר | ✅ |
| `/settings/whatsapp-templates` | עריכת תבניות הודעות וואטסאפ | משתמש מחובר | ✅ |
| `/error-logs` | יומן שגיאות | משתמש מחובר | ✅ |
| `/worker` | מסך עובד: מצב מנהל (מחובר) או **קישור עם `?token=`** (`access_token`) ללא Google; `sessionStorage` | ציבורי עם טוקן; מחובר ללא טוקן | ✅ |
| `/billing` | סיכום שימוש (טיקטים החודש, דיירים, עובדים, גרף שבועי) | משתמש מחובר | ✅ |
| `/pending-residents` | דיירים ממתינים | משתמש מחובר | ✅ |
| `/summary` | סיכומים | משתמש מחובר | ✅ |
| `/report` | דיווח דיירים (ציבורי) — `?client=`; טעינת בניינים מ־`/api/public/projects` (לא Supabase anon ישירות) | ציבורי | ✅ |

---

## 3. מפת API Routes

| נתיב | Method | תפקיד | Supabase | בידוד `client_id` | שגיאות |
|------|--------|--------|-----------|-------------------|--------|
| `/api/webhook/whatsapp` | POST (וגם GET לאימות) | Webhook Meta — הודעות נכנסות/יוצאות | כן (לרוב admin) | `whatsapp_phone_number_id` → `clients` | לוגים + תגובות HTTP |
| `/api/create-ticket` | POST | יצירת תקלה (+קבצים) | admin | סשן או `client_id` בטופס (דיווח ציבורי) | try/catch + JSON errors |
| `/api/update-ticket` | POST/PATCH | עדכון תקלה | כן | לפי לוגיקת route | כן |
| `/api/close-ticket` | POST | סגירת תקלה | כן | כן | כן |
| `/api/assign-ticket` | POST | שיבוץ | כן | כן | כן |
| `/api/merge-ticket` | POST | מיזוג תקלות | כן | כן | כן |
| `/api/create-project` | POST | יצירת פרויקט | כן | כן | כן |
| `/api/delete-project` | POST/DELETE | מחיקה | כן | כן | כן |
| `/api/create-worker` | POST | יצירת עובד | כן | כן | כן |
| `/api/import-residents` | POST | ייבוא דיירים | כן | כן | כן |
| `/api/public/projects` | GET | רשימת פרויקטים לדיווח ציבורי (מסונן בשרת) | admin | `client_id` + `project` / `q` + rate limit IP |
| `/api/worker-auth` | GET | אימות `?token=` → `worker_id`, `client_id`, `full_name` | admin | — | 404 |
| `/api/worker/tickets` | GET/PATCH | רשימה/עדכון סטטוס תקלה לפי טוקן עובד | admin | טוקן → worker | כן |
| `/api/billing/summary` | GET | KPI + טיקטים לפי שבוע | admin | סשן | כן |
| `/api/push/subscribe` | POST | שמירת Web Push subscription | admin | סשן | כן |
| `/api/pending-residents` | GET/PATCH | דיירים ממתינים | כן | סשן → `client_id` | כן |
| `/api/translate-ticket` | POST | תרגום תיאור | כן | דורש סשן (מניעת שימוש חיצוני) | כן |
| `/api/notify-reporter-ticket-closed` | POST | התראה למדווח | כן | כן | כן |
| `/api/onboarding/organization` | POST | ארגון ראשון | כן | קשור ל־org/client | כן |
| `/api/onboarding/project` | POST | פרויקט באונבורדינג | כן | כן | כן |
| `/api/onboarding/session` | GET | סשן אונבורדינג | כן | — | כן |
| `/api/settings/test-whatsapp` | POST | בדיקת שליחה | כן | סשן → `client_id` | כן |
| `/api/settings/upload-logo` | POST | העלאת לוגו | כן | סשן → `client_id` | כן |
| `/api/cron/sla-check` | GET | בדיקת SLA (Vercel Cron) | admin | לפי `client_id` בשורות תקלות | לוגים |
| `/api/cron/whatsapp-retry` | GET | ניסיון חוזר לשליחות שנכשלו | admin | לפי `error_logs` | לוגים |

*פרטים מדויקים לכל route — ראו את הקובץ המתאים תחת `app/api/`.*

---

## 4. Supabase — טבלאות עיקריות (לפי מיגרציות)

| טבלה | עמודות / מטרה עיקרית | RLS | Policies (דוגמה) |
|------|----------------------|-----|-------------------|
| `clients` | לקוח, הגדרות SMS/WhatsApp | כן (מיגרציות מוקדמות) | מדיניות dashboard / service_role |
| `organizations` | ארגון SaaS | כן | `service_role_bypass` |
| `organization_users` | קישור user↔org | כן | `service_role_bypass` |
| `projects` | פרויקטים, `client_id`, SLA; ייחוד `project_code` בתוך לקוח (022); anon ללא SELECT ישיר (023) | כן | authenticated (022); דיווח ציבורי דרך API בלבד |
| `workers` | עובדים, `client_id` | כן | |
| `tickets` | תקלות, סטטוס, SLA alerted | כן | |
| `residents` | דיירים | כן | |
| `ticket_logs` | היסטוריית פעולות | כן | |
| `ticket_attachments` / אחסון | קבצים | דרך Storage + RLS | |
| `whatsapp_templates` | תבניות הודעות לפי `client_id` + `template_key` | כן | authenticated + service |
| `error_logs` | שגיאות כולל `whatsapp_send` | כן | service + authenticated לפי 020 |
| `ticket_internal_messages` | צ'אט פנימי לתקלה | כן | |
| `processed_webhooks` | מניעת כפילויות webhook | כן | |
| טבלאות session / pending (וואטסאפ) | מיגרציות 013–016 | כן | |

*לפרטי עמודות מלאים — קראו את קבצי ה־SQL ב־`supabase/migrations/`.*

---

## 5. WhatsApp

| נושא | פירוט |
|------|--------|
| **Webhook URL** | `https://<הדומיין שלכם>/api/webhook/whatsapp` (וגם URL שמוגדר אצל Meta). |
| **Triggers** | הודעות נכנסות מדיירים/מפעילים; יצירת/עדכון תקלות; תשובות אינטראקטיביות; זרימות START / אישורים וכו' — הכל מרוכז ב־`app/api/webhook/whatsapp/route.ts`. |
| **תבניות** | `resolveWhatsAppTemplateMessage` — טעינה מ־DB עם **cache בזיכרון** (60 שניות) לפי `client_id` + מפתח; fallback מהקוד. משתני `{{project_name}}`, `{{ticket_number}}`, … |
| **תגובת webhook** | אחרי dedupe: תשובה מיידית `{ status: 'ok' }`; המשך עיבוד ב־`after()` (Next.js) כדי לא לחסום את Meta. |
| **Retry** | Cron `vercel.json` → `/api/cron/whatsapp-retry` כל 5 דקות; רשומות `error_logs` עם `context = 'whatsapp_send'` ו־`whatsapp_attempts` &lt; 3. |
| **SLA** | Cron שעתי → `/api/cron/sla-check`; עמודות `sla_hours`, `sla_alerted` על תקלות/פרויקטים (מיגרציה 020). |

---

## 6. Auth Flow

1. **התחברות:** המשתמש בוחר **"התחבר עם Google"** ב־`/login` → `signInWithOAuth({ provider: 'google', options: { redirectTo: <origin>/auth/callback> } })`.  
   *הערה טכנית:* נתיב `/auth/callback` מחליף PKCE; אחרי הצלחה redirect ל־`next` מה־query של callback (ברירת מחדל `/` אם חסר).
2. **Google Console:** Authorized redirect URI חייב לכלול את  
   `https://<project-ref>.supabase.co/auth/v1/callback`  
   (כפי שמופיע ב-Supabase).
3. **Supabase Dashboard:** להפעיל Provider של Google; תחת **URL configuration** להוסיף את כתובת האפליקציה, למשל `https://<app>/auth/callback`.
4. **אחרי התחברות:** redirect ל־`/` (או ל־`redirectTo` המאושר).  
5. **משתמש חדש בלי פרויקטים פעילים** (לוגיקה ב־`middleware.ts` + `resolveClientIdForUserId`): redirect ל־`/onboarding`.  
6. **אונבורדינג:** טפסים בדף → `POST /api/onboarding/*` — יוצרים ארגון/פרויקט/עובד.  
7. **יציאה:** `signOut()` מהכפתור בתפריט.  
8. **לא מורשה / לא מחובר:** middleware מפנה ל־`/login`.

---

## 7. משימות אחרונות (סשן אפריל–מאי 2026)

### סשן מאי 2026

- ✅ **Auth SSR fix:** `lib/supabase.ts` — עבר ל-`createBrowserClient` מ-`@supabase/ssr`.  
- ✅ **Multi-tenant resolver:** `lib/tenant-resolution.ts` — batch-fetch עד 20 ארגונים, `first valid client_id`.  
- ✅ **Integration tests (122):** `tests/integration/supabase-schema.integration.test.ts` — בדיקות live נגד Supabase; introspection דרך `.select(col).limit(0)` (אין גישה ל-`information_schema`).  
- ✅ **מיגרציה 034:** `deleted_at` ל-`tickets`, `workers`, `residents` עם `IF NOT EXISTS`.  
- ✅ **4 תוכניות מחיר:** `lib/plan-limits.ts` — starter/pro/business/enterprise + `PLAN_PRICES` + `normalizeTier`.  
- ✅ **מיגרציה 035:** `max_tickets_per_month`, CHECK constraint על `plan_tier`.  
- ✅ **ויזארד הקמת לקוח:** `app/api/admin/setup-client/route.ts` — מוגן ב-`x-admin-secret`; יוצר clients → organizations → invite Auth → organization_users → projects → workers; מחזיר QR links.  
- ✅ **Hebrew JSDoc לכל הדפים:** `app/page.tsx`, `app/tickets/page.tsx`, `app/projects/page.tsx`, `app/workers/page.tsx`, `app/residents/page.tsx`, `app/pending-residents/page.tsx`, `app/qr/page.tsx`, `app/summary/page.tsx`, `app/billing/page.tsx`, `app/error-logs/page.tsx`, `app/onboarding/page.tsx`.  
- ✅ **E2E tests מלאים:** `tests/e2e/flows.spec.ts` — 70+ בדיקות: ציבורי, auth redirects, API security, health, ניווט.

### סשן אפריל 2026

- ✅ **משימה 1:** עובד שטח עם טוקן ייעודי (`access_token`, API, `/worker`, העתק קישור).  
- ✅ **משימה 2:** PWA — מטמון משופר (`bamakor-v2`) + `offline.html`.  
- ✅ **משימה 3:** Rate limiting דיווח ציבורי (`rate_limits` + RPC, 20/דקה/IP).  
- ✅ **משימה 4:** Billing בסיסי (טריגרים + `/billing`).  
- ✅ **משימה 5:** ייצוא Excel מתקלות מסוננות.  
- ✅ **משימה 6:** Web Push (הגדרות + שליחה מ-`create-ticket`).  

### קצוות פתוחים

- **RLS מול Service Role:** API עם service role עוקף RLS — חובה לשמור על סינון `client_id` בכל שינוי בנתיבים.  
- **דיווח ציבורי:** עדיין תלוי בידיעת `client_id` בקישור; קצב מוגבל ב־IP בלבד.  
- **טוקן עובד:** מי שמחזיק בקישור רואה תקלות משויכות — לסובב טוקן בעתיד אם נדרש.  
- **שם `getSingletonClientId`:** עטיפה ל־`requireClientIdForUser` — אפשר לשנות שם לבהירות.  
- **VAPID / Push:** ללא מפתחות ב־env — השליחה מושבתת בשקט; יש להגדיר מפתחות בפרודקשן.

---

## 8. ציון מוכנות

| תחום | ציון | הסבר קצר |
|------|------|-----------|
| **Frontend** | ✅ | דפים עיקריים; `client_id` בדפדפן לפי ארגון המשתמש (`resolveBamakorClientIdForBrowser`). |
| **API Routes** | ✅ | נתיבי דשבורד: `requireSessionClientId`; webhook: `resolveClientIdByWhatsAppPhoneNumberId`; דיווח ציבורי: `client_id` בטופס. |
| **Supabase** | ✅ | מיגרציות 022–027: tenant, דיווח ציבורי, `whatsapp_business_phone`, עובד `access_token`, `rate_limits`, `billing_events`, `push_subscriptions`, טריגרי billing; 025–026 תיקונים/seed; **027** — לפני האינדקסים מוסיף `client_id` חסר ל־`tickets` / `error_logs` (ובמידת הצורך `workers` / `residents`) וממלא מ־`projects` / `organizations` / `details`, ואז יוצר את האינדקסים (`idx_tickets_*`, `idx_residents_client_id`, `idx_workers_client_id`, `idx_ticket_logs_ticket_id`, `idx_whatsapp_templates_lookup`, `idx_error_logs_client`). |
| **Auth** | ✅ | Google OAuth + callback + middleware + onboarding + יציאה בתפריט. |
| **WhatsApp** | ✅ | Webhook גדול, תבניות DB, retry cron, SLA cron. |
| **Multi-tenant isolation** | ✅ | `client_id` נגזר מ־`organization_users` → `organizations` למשתמש מחובר; webhook לפי `whatsapp_phone_number_id`; `BAMAKOR_CLIENT_ID` / `NEXT_PUBLIC_*` רק fallback ב־development. |
| **Field worker / PWA / Push / Billing** | ✅ | טוקן עובד, SW v2 + offline, rate limit ציבורי, billing + Excel, Web Push עם VAPID. |

---

## נספח: הגדרות חיצוניות (Checklist)

- [ ] Supabase → Authentication → Providers → **Google** מופעל.  
- [ ] Google Cloud Console → OAuth → Redirect URI: `https://<ref>.supabase.co/auth/v1/callback`.  
- [ ] Supabase → URL configuration → **Redirect URLs** כולל `https://<your-app-domain>/auth/callback`.  
- [ ] Vercel / hosting: משתני סביבה `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, ואופציונלית `BAMAKOR_CLIENT_ID`.  
- [ ] הרצת מיגרציה **024** (`024_worker_token_billing_push_rate_limits.sql`) בפרויקט Supabase.  
- [ ] Web Push (אופציונלי): `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (אופציונלי, למשל `mailto:...`), ו־**`NEXT_PUBLIC_VAPID_PUBLIC_KEY`** זהה לציבורי — ליצירת זוג: `npx web-push generate-vapid-keys`.

---

## 9. UX, Toasts וביצועים (אפריל 2026)

- **Toasts בעברית:** פעולות מפתח (טיקטים, פרויקטים, עובדים, דיירים, ייבוא CSV, אישור ממתינים, הגדרות, תבניות וואטסאפ, Excel) מציגות `toast.success` / `toast.error` עם ניסוח אחיד; טקסטים מרוכזים ב־`lib/toast-messages.ts` (`TM.*`).
- **`fetch` עם timeout:** `lib/fetch-with-timeout.ts` — `fetchWithTimeout()` עם **10 שניות** ברירת־מחדל; בשימוש בדפי האפליקציה ובמודלים שקוראים ל־API (יצירת תקלה, שיבוץ, סגירה, billing, onboarding, worker, דיווח ציבורי, pending residents, ייבוא דיירים, וכו').
- **Skeleton טעינה:** `app/components/page-skeleton.tsx` (`PageListSkeleton`, `PageKpiSkeleton`, `PageKpiSkeletonN`) + אנימציה `bamakor-skeleton-pulse` ב־`app/globals.css` — בשימוש בדשבורד, תקלות, פרויקטים, עובדים, דיירים, חיוב, דיירים לאישור, תבניות וואטסאפ.
- **מיזוג קריאות Supabase:** טעינה ראשונית של פרויקטים — `Promise.all` לעובדים+פרויקטים; דשבורד — לוגים וצרופות למגירת תקלה במקביל; דיירים — פרויקטים + דיירים + `GET /api/pending-residents` במקביל.
- **מיגרציה 027:** `supabase/migrations/027_perf_indexes.sql` — להריץ ב־Supabase: אם בפרויקט חסרה עמודת `client_id` ב־`tickets` (או ב־`error_logs`), הסקריפט מוסיף אותה וממלא לפני יצירת האינדקסים; כך נמנעת שגיאת `42703 column "client_id" does not exist` ב־SQL Editor.

---

## 10. יומן מפתחים — עדכון (30/04/2026)

- **אבטחה — אין מפתחות hardcoded:** בוצעה סריקה בקוד כדי לוודא שאין `anon key`/`service role key` בתוך קבצים. כל המפתחות נצרכים רק מ־`process.env.*`. בנוסף `lib/supabase.ts` יושר לתבנית:  
  `const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!`  
  `const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!`
- **Timeout לכל fetch:** נסגרו שאריות `fetch()` ללא timeout (כולל onboarding), ו־`lib/logging.ts` עודכן לשליחה מרחוק עם `fetchWithTimeout()` כדי למנוע תלייה ברשת.
- **Promise.all ב־API:** `GET /api/pending-residents` עודכן כך שטעינת `projects` + `tickets` נעשית ב־`Promise.all` ולא בטור.
- **מיגרציה 027 — אינדקסים + התאמה ל־DB חלקי:** 027 כוללת הוספה/backfill של `client_id` לטבלאות שעשויות להיות חסרות (בעיקר `tickets`, ולעיתים `error_logs`), לפני יצירת אינדקסים. שמות אינדקסי tickets עודכנו לשמות: `idx_tickets_client_id`, `idx_tickets_client_status`, `idx_tickets_client_created`.
- **דוח ביקורת:** נוסף `AUDIT_REPORT.md` עם ממצאים, תיקונים שבוצעו, והמלצות לבדיקה ידנית לפרודקשן.
