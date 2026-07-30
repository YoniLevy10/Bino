# תוכנית אבטחה — פריסה בטוחה מול דיירים ולקוח משלם

עקרון מנחה: **לא לשבור WhatsApp inbound, סגירת תקלות, SMS, או פורטל עובדים.**  
כל שלב = PR קטן + בדיקת smoke בפרודקשן לפני השלב הבא.

מקור העבודה הקיים: [#71](https://github.com/YoniLevy10/Bamakor/pull/71) (`cursor/security-hardening-5a40`) — **לא למזג כמו שהוא**.  
ה־PR בקונפליקט עם `main`, גדול מדי (~80 קבצים), ומערב שינויים בסיכון גבוה עם שינויים בטוחים.

---

## מה כבר סגור (env)

| פריט | סטטוס |
|------|--------|
| `WHATSAPP_APP_SECRET` ב־Vercel (Production + Preview, Sensitive) | מוגדר |
| שאר מפתחות WhatsApp / SMS / Cron / Admin | מוגדרים (ראה `CLAUDE.md`) |

**היגיינה מומלצת (לא חוסם פריסה):** לסמן גם את `WHATSAPP_ACCESS_TOKEN` כ־Sensitive ב־Vercel UI (כרגע מופיע בלי מנעול).

פערי האבטחה שנותרו הם בעיקר **קוד והרשאות**, לא חוסר במשתני סביבה.

---

## למה לא למזג את #71 בבת אחת

| שינוי ב־#71 | סיכון לפרודקשן חי |
|-------------|-------------------|
| WhatsApp: 503 אם אין secret / 403 אם חתימה לא תקינה | **נמוך עכשיו** — ה־secret כבר ב־Vercel. Meta שולחת חתימה. |
| אכיפת org roles (`viewer` read-only) | **בינוני** — אם משתמש לקוח סומן `viewer`/`manager` בטעות, פעולות דשבורד ייחסמו ב־403. (null/legacy → `admin` בקוד ה־PR — טוב לדיירים קיימים.) |
| הסתרת `workers.access_token` + API `portal-link` + migration 087 | **גבוה לתפעול** — כפתור "העתק קישור עובד" / SMS הזמנה עלולים להישבר אם UI ו־API לא עולים יחד, או אם המיגרציה רצה לפני הדיפלוי. |
| Cron: ביטול `?secret=` | **נמוך ל־Vercel Cron** (שולח Bearer). **בינוני** לטריגרים ידניים/סקריפטים שמשתמשים ב־query. |
| Rate limit: זיכרון במקום fail-open | **נמוך–בינוני** — ב־cold start / multi-instance ההגבלה פחות מדויקת; לא אמור להפיל WhatsApp. |
| Admin secret בלי `localStorage` | **נמוך** — רק superadmin UX. |
| Security headers (CSP וכו') | **בינוני** — CSP מחמיר עלול לשבור אנליטיקס/פונטים/תמונות אם לא נבדק ב־Preview. |
| GreenInvoice / document-sign secrets חובה | **בינוני** — ישבור webhooks אם הסוד לא מוגדר ב־URL/header של הספק. |

---

## שלבי פריסה (מומלץ)

### שלב 0 — הכנה (בלי דיפלוי קוד)

1. לסגור/לסמן את #71 כ־**Do not merge** ולפצל ממנו PRs חדשים לפי השלבים למטה (rebase על `main` אחרי קונפליקטים).
2. ב־Supabase: לבדוק roles של משתמשי הלקוח המשלם:

```sql
SELECT ou.user_id, ou.role, o.client_id, c.name
FROM organization_users ou
JOIN organizations o ON o.id = ou.organization_id
JOIN clients c ON c.id = o.client_id
ORDER BY c.name, ou.role;
```

   - כל מי שעובד יום־יום בדשבורד צריך `admin` (או לפחות `manager` אחרי שלב 3).
3. לוודא שאין סקריפטים חיצוניים שקוראים ל־`/api/cron/*?secret=...`.
4. Smoke checklist קבוע אחרי כל דיפלוי (למטה).

### שלב 1 — סיכון נמוך (אפשר ראשון)

**תוכן (מתוך #71, בלי roles / בלי worker token / בלי CSP מחמיר):**

- `timingSafeEqual` ל־cron/admin (`lib/secure-compare.ts`)
- הסרת `?secret=` מ־cron **רק אחרי** אימות ש־Vercel Cron עובר עם Bearer
- כפיית חתימת WhatsApp (fail-closed) — ה־env כבר קיים
- עדכון טסטים ל־webhook signature

**בדיקות לפני merge ל־main:**

- [ ] Preview: שליחת הודעת בדיקה ל־WhatsApp → webhook 200, תקלה נוצרת
- [ ] אחרי promote: אותו דבר בפרודקשן
- [ ] Cron הבא בלוגים (למשל `health-check` / `sla-check`) → 200, לא 401

**Rollback:** revert של ה־PR. WhatsApp חוזר להתנהגות רכה יותר; אין שינוי סכמה.

### שלב 2 — Headers + rate-limit memory (אחרי שלב 1 יציב)

- Security headers ב־`next.config.ts` — להתחיל עם headers שמרניים (`X-Frame-Options`, `nosniff`, `referrer-policy`); **CSP מלא רק אחרי בדיקת Preview** על דשבורד + `/worker` + `/report`
- Rate limit: fallback בזיכרון במקום fail-open

**בדיקות:**

- [ ] דשבורד נטען (אין שבירת סקריפטים/Sentry/Analytics)
- [ ] `/worker` PWA + העלאת צרופה
- [ ] `/report` דיווח ציבורי

**Rollback:** revert; אין DB.

### שלב 3 — Org roles (זהירות מול הלקוח)

- `lib/org-roles.ts` + `requireSessionClientId` עם דרגת הרשאה
- אכיפה על mutations בלבד (reads נשארים)
- **לפני דיפלוי:** לתקן ב־DB כל משתמש פעיל ל־`admin`/`manager` לפי הצורך (שלב 0)

**המלצת בטיחות נוספת (אופציונלי בקוד):** feature flag env  
`ORG_ROLE_ENFORCEMENT=1` — כבוי כברירת מחדל בפרודקשן, מדליקים אחרי שבוע ניטור.  
(אם מוסיפים flag — לא חייבים ב־#71 המקורי; עדיף ל־PR חדש.)

**בדיקות עם המשתמש האמיתי של הלקוח:**

- [ ] יצירת/סגירת תקלה
- [ ] הגדרות (רק `admin`)
- [ ] משתמש `viewer` (אם יש) מקבל 403 על כתיבה — ולא שובר את המסך לגמרי

**Rollback:** revert קוד. Roles ב־DB לא מזיקים בלי אכיפה.

### שלב 4 — Worker portal token (הכי רגיש תפעולית)

סדר חובה:

1. דיפלוי API החדש `GET/POST /api/workers/portal-link` + עדכון UI (`app/workers/page.tsx`, invite SMS) **באותו דיפלוי**
2. Smoke: העתק קישור + שליחת SMS הזמנה + כניסת עובד עם הקישור הישן שעדיין בטלפון
3. **רק אז** מיגרציה `087_workers_hide_access_token.sql` (REVOKE מ־PostgREST)
4. קישורי עובדים קיימים ב־SMS/bookmarks **נשארים תקפים** (הטוקן ב־DB לא משתנה — רק נסתר מה־anon client)

**בדיקות:**

- [ ] עובד עם לינק ישן נכנס ל־`/worker?token=…`
- [ ] מנהל מעתיק לינק חדש מהדשבורד
- [ ] אין `access_token` ב־Network tab על `from('workers').select(...)`

**Rollback קוד:** revert UI/API.  
**Rollback מיגרציה:** `GRANT` מחדש ל־`access_token` (לשמור סקריפט reverse מוכן לפני ה־APPLY).

### שלב 5 — Webhooks חיצוניים (Collections / חתימות)

- חובת `GREENINVOICE_WEBHOOK_SECRET` / `DOCUMENT_SIGN_WEBHOOK_SECRET` **רק אחרי** שהסוד מוגדר אצל הספק וב־Vercel
- עד אז: לא לכפות 401 על webhook פעיל בלי תיאום

---

## Smoke checklist (אחרי כל דיפלוי ל־production)

| # | זרימה | איך |
|---|--------|-----|
| 1 | WhatsApp דייר → תקלה חדשה | הודעה אמיתית / sandbox לדייר בדיקה |
| 2 | סגירת תקלה מדשבורד או עובד | `ticket_closed` / סטטוס נסגר |
| 3 | Worker PWA | רשימת תקלות + צרופה (אם בשימוש) |
| 4 | Cron | רשומה אחרונה ב־Vercel logs בלי 401 |
| 5 | דשבורד מנהל הלקוח | login + פעולת כתיבה אחת |

אם אחד נכשל → **revert מיידי**, לא "לתקן קדימה" בזמן שהדיירים תקועים.

---

## מה לא לעשות עכשיו

- לא למזג את #71 השלם
- לא להריץ migration 087 לפני דיפלוי ה־portal-link
- לא לסובב/לאפס `workers.access_token` של עובדים פעילים
- לא להפעיל CSP מחמיר בלי Preview מלא
- לא להפוך GreenInvoice ל־fail-closed לפני עדכון URL אצל Morning

---

## מעקב

| שלב | PR ייעודי (חדש) | סטטוס |
|-----|-----------------|--------|
| 1 Webhook + cron harden | TBD מתוך #71 | לא התחיל |
| 2 Headers + rate-limit | TBD | לא התחיל |
| 3 Org roles | TBD | לא התחיל |
| 4 Worker portal token | TBD | לא התחיל |
| 5 Billing/sign webhooks | TBD | לא התחיל |

לאחר השלמת השלבים: לסגור את #71 עם הערה שמפנה ל־PRs המפוצלים.
