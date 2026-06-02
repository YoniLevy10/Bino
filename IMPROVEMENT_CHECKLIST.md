# Bamakor — רשימת שיפורים (מתחילת שיחת הפיתוח)

מסמך מרכזי למעקב אחרי כל הנושאים שזוהו לשיפור: איכות מערכת, אבטחה, תפעול, ו**שליטה מלאה למנהל** (דסקטופ + מובייל + נגישות).

**איך להשתמש:** סמן `[x]` כשהפריט הושלם. עדיפות: P0 → P1 → P2 → P3.

---

## עדיפות עליונה (P0) — אבטחה, יציבות, שליטת מנהל

### אבטחה ופרודקשן

- [ ] להגדיר `WHATSAPP_APP_SECRET` ב-Vercel (חתימת webhook Meta) — **ידני ב-Vercel**
- [ ] לוודא `GET /api/health` מחזיר `envWarnings: []` אחרי deploy
- [ ] לסקור `/api/worker/*` — expiry ל-token, scope, rate limit בכל endpoint
- [ ] לוודא ש-`whatsapp_access_token` לא נחשף ל-frontend (רק שרת)
- [ ] rotation / הגנה על `x-admin-secret` (superadmin / admin setup)

### איכות ושער merge (CI)

- [x] להוסיף GitHub Actions: `lint` + `typecheck` + `vitest` + `next build` על כל PR
- [ ] אחרי מיגרציה: `npm run db:types` + כשל build אם types לא מסונכרנים

### כתיבות ל-DB (באגים שקטים)

- [x] להעביר mutations מהדפדפן ל-API + `getSupabaseAdmin()` — `tickets` (`app/tickets/page.tsx`, `app/page.tsx`)
- [x] אותו דבר — `workers` (`app/workers/page.tsx`)
- [x] אותו דבר — `residents` (`app/residents/page.tsx`)
- [x] אותו דבר — `projects` (`app/projects/page.tsx`)
- [x] אותו דבר — `error_logs` (`app/error-logs/page.tsx`)
- [x] אותו דבר — `whatsapp_templates` (`app/settings/whatsapp-templates/page.tsx`)
- [x] אותו דבר — `ticket_internal_messages` (`TicketChat.tsx`)
- [ ] לוודא שכל POST מוגן עוקב אחרי סדר: `requireSessionClientId` → rate limit → Zod → לוגיקה (חלקי — routes חדשים)

### שליטת מנהל — מובייל = דסקטופ (פערים קריטיים)

- [x] כפתור חיפוש במובייל → פותח `GlobalSearch` (לא רק `Ctrl+K`)
- [x] "מחק נבחרים" + "מחק הכל" בתקלות — זמינים גם במובייל (עם confirm)
- [x] לוודא מיזוג תקלות נגיש וברור במובייל (במגירת פרטי תקלה)
- [x] איחוד breakpoint: כל הדפים על `getIsMobileViewport()` (768px) — לא 900px ב-`summary` / `whatsapp-templates`

---

## P1 — ארכיטקטורה ותחזוקה

### מונוליטים ו-API

- [ ] לפצל `app/api/webhook/whatsapp/route.ts` (~1,450 שורות) לשכבות: חתימה → dedupe → intent → תקלה → templates
- [ ] לאחד `merge-ticket` ו-`tickets/merge` (route אחד + deprecate)
- [ ] Zod + `checkAuthenticatedPostRouteLimit` על `settings/update` (חסרים היום)
- [ ] לעבור על כל 44 ה-API handlers מול התבנית ב-`CLAUDE.md`

### דפים וקומפוננטות

- [ ] לפצל `app/tickets/page.tsx` — hooks, טבלה, מגירה, Excel
- [ ] regression test: כל שדה ב-`tenant-resolution` SELECT שמופיע ב-webhook

### נגישות (a11y) — בסיס

- [ ] focus trap + `Escape` במגירות ומודלים
- [ ] `aria-expanded` על תפריט המבורגר; `aria-modal` על overlays
- [ ] כל `input` עם `id` + `label htmlFor`; שגיאות עם `aria-describedby`
- [ ] `aria-live="polite"` ל-toast / שמירה מוצלחת
- [ ] `eslint-plugin-jsx-a11y` בפרויקט
- [ ] `@axe-core/playwright` על `/login`, `/tickets`, `/settings`

---

## P2 — מוצר, מנהל, מובייל, תקשורת

### ניווט וחוויית מנהל (מובייל)

- [ ] לצמצם סרגל תחתון: 5 פריטים קבועים (בית · תקלות · פרויקטים · עובדים · הגדרות) + תפריט "עוד"
- [ ] בתפריט "עוד": דיירים, QR, סיכום, תבניות WhatsApp, חיוב
- [ ] קישור ברור ל-`/billing` (לא רק מתוך הגדרות)
- [ ] להעביר "יומן שגיאות" ל"מתקדם" (לא בסרגל הראשי למנהל שטח)
- [ ] קיצורי PWA ב-`manifest.json`: "תקלה חדשה" → `/tickets?new=1`
- [ ] Onboarding מובייל: "הוסף למסך הבית" אחרי login ראשון

### נגישות — המשך

- [ ] סקירת ניגודיות (טקסט מ-muted על רקע בהיר)
- [ ] בדיקת VoiceOver (iPhone) על 3 תרחישים: תקלה, שיוך עובד, הגדרות SMS
- [ ] ניווט מקלדת בדסקטופ על אותם תרחישים

### תקשורת (SMS / WhatsApp / Push)

- [ ] UI ל-`failed_notifications` (תור כשלונות SMS/WhatsApp)
- [ ] idempotency ליצירת תקלה מ-UI (לחיצה כפולה)
- [ ] `translate-ticket` — לעבור ל-`fetch-timeout` במקום `fetch` גולמי
- [ ] התראה אם cron נכשל (Sentry + `system_logs`)

### מוצר ו-SaaS

- [ ] מגבלות תוכנית (billing) — חסימה/אזהרה לפני חריגה, לא רק תצוגה
- [ ] מטריקות onboarding: זמן עד פרויקט ראשון, QR, תקלה ראשונה מ-WhatsApp
- [ ] דף `/pending-residents` (מוזכר ב-README, API קיים — UI חסר)

### בדיקות

- [ ] E2E מובייל **מחובר**: login → תקלה → שינוי סטטוס → הגדרות → שמירה
- [ ] בדיקות API ל-`close-ticket`, `assign-ticket`, `create-ticket` (mock Supabase)
- [ ] הרחבת `whatsapp-webhook.post.test.ts` אחרי פיצול ה-webhook

---

## P3 — נתונים, תפעול, DX, מוצר מתקדם

### Supabase ונתונים

- [ ] `audit_log` מחובר לפעולות רגישות (מחיקה, הגדרות, מיזוג)
- [ ] job retention: `processed_webhooks`, לוגים, attachments ישנים
- [ ] ניטור slow queries לדפים כבדים (`/tickets`, dashboard)
- [ ] גיבוי Supabase + PITR מאומת (ראה `DEPLOYMENT_CHECKLIST.md`)

### ניטור ותפעול

- [ ] Sentry tags: `client_id`, `channel`, route
- [ ] Runbooks: SMS status 515, webhook 403, RLS silent write
- [ ] קישור Sentry issue ↔ `/error-logs`

### DevOps ותיעוד

- [ ] `.env.example` מסונכרן עם Vercel (כולל `WHATSAPP_APP_SECRET`)
- [ ] Deploy hook / בדיקת health אחרי promote
- [ ] סביבת staging (Supabase branch / project נפרד)
- [ ] ADR קצרים להחלטות (למשל: אין location ב-WhatsApp)

### Worker portal (משני למנהל)

- [ ] PWA/offline מינימלי לעובד שטח
- [ ] UX תמונות וסטטוסים בעברית פשוטה

### מוצר עתידי (מהשיחה הראשונה)

- [ ] Worker portal — שיפורי UX שטח (נפרד ממנהל)
- [ ] Data retention policy מלאה ב-DB (מדיניות פרטיות)

### יומן + שעון עובדים (ענף `develop` בלבד כרגע)

רשימה מפורטת לפי דף + אחידות עיצוב: **`IMPROVEMENT_CHECKLIST_OFFICE.md`** (ב-worktree `bamakor-dashboard-dev`).

- [ ] **P0 עיצוב:** `styles.content`, KPI, `Card noPadding`, skeleton — `/calendar`, `/attendance`
- [ ] **P0 יומן:** לוח חודש, עריכה/מחיקת אירוע
- [ ] **P0 שעון:** סינון תאריכים, ייצוא Excel, טבלה אחידה
- [ ] **P1:** מפת GPS, תיקון שעות ידני, מובייל בסרגל תחתון
- [ ] **P2:** Google Calendar, גדר גיאוגרפית, עלות לפי תעריף

---

## Parity — מנהל: מה חייב לעבוד בשני המכשירים

| משימה | דסקטופ | מובייל | סטטוס |
|--------|--------|--------|--------|
| תקלות — צפייה / עריכה / סגירה | ✓ | ✓ | בסיס קיים |
| שיוך עובד | ✓ | ✓ | בסיס קיים |
| צ'אט פנימי בתקלה | ✓ | ? | לוודא UX במגירה |
| עובדים / פרויקטים / דיירים | ✓ | ✓ | כרטיסים במובייל |
| ייבוא דיירים Excel | ✓ | חלקי | לשפר / "העלה קובץ" |
| QR | ✓ | ✓ | הורדה + שיתוף |
| הגדרות SMS/WhatsApp | ✓ | ✓ | |
| תבניות הודעות | ✓ | ✓ | |
| סיכומים | ✓ | ✓ | |
| חיוב | ✓ | קישור | לשפר ניווט |
| חיפוש גלובלי | ✓ | ✗ | **P0** |
| מחיקה / מיזוג מרובה | ✓ | חלקי | **P0** |

---

## סדר עבודה מומלץ (ספרינטים)

1. **ספרינט 1 (P0):** `WHATSAPP_APP_SECRET` + CI + חיפוש מובייל + מחיקות במובייל + breakpoint אחיד  
2. **ספרינט 2 (P0–P1):** העברת כתיבות ל-API + `settings/update` סטנדרטי  
3. **ספרינט 3 (P1):** פיצול webhook + a11y בסיס + ESLint a11y  
4. **ספרינט 4 (P2):** סרגל תחתון + failed_notifications UI + E2E מובייל מחובר  
5. **ספרינט 5 (P2–P3):** billing limits, pending-residents, retention, runbooks  

---

## קישורים ב-repo

| מסמך | תוכן |
|------|------|
| `CLAUDE.md` | כללי פיתוח (API, SMS, Supabase, מובייל) |
| `DEPLOYMENT_CHECKLIST.md` | פריסה לפרודקשן |
| `README.md` | מפת דפים ותכונות |

*עודכן לפי שיחת פיתוח — יוני 2026*
