# BINO — תוכנית פיתוח CTO (6 מסלולים)

**תאריך:** 2026-10-14  
**סטטוס:** Audit + תוכנית בלבד — **אין** שינויי קוד / DB / הרשאות / ייבוא / App Store ללא אישור מפורש.  
**עקרון מנחה:** יציבות → ביצועים → פשטות. לא להוסיף מורכבות לפני שיש ערך מוכח ללקוח משלם.

**North-star:** זיכרון תפעולי, החלטה/מניעה, הוכחת חיסכון (זמן עד שיוך / פתרון / תקלות חוזרות / עלות / % ללא מנהל).

---

## 0) מפת מצב — סיכום חד

| # | מסלול | מצב | פעולה מומלצת ראשונה |
|---|--------|------|---------------------|
| 1 | ניהול משימות | **קיים (~80%)** | קישור לתקלה + התראת שיוך (שיפור קטן) |
| 2 | עדכוני דייר על סטטוס | **חלקי** — open/close בלבד | Push על `IN_PROGRESS` / `WAITING_PARTS` דרך WA |
| 3 | המלצות AI | **קיים כ־rules** — לא ML | דיוק הקשר + פעולה אחת אוטומטית + evals |
| 4 | ייבוא ממערכת קודמת | **חלקי** — דיירים בלבד | מיפוי + dry-run; **אין ייבוא** לפני אישור |
| 5 | קיבולת וביצועים | **קיים + מתועד** | מדידה לפי סף (10k tickets) + אינדקסים רק עם EXPLAIN |
| 6 | App Store iOS | **חלקי** — WKWebView shell | השלמת AASA/`APPLE_TEAM_ID`; **אין המרה** לפני אישור |

---

## 1) ניהול משימות פנימיות

### מה קיים
- טבלה `maintenance_tasks` + `maintenance_task_attachments` — `supabase/migrations/105_…sql`
- עמודות: `project_id`, `assigned_worker_id`, `priority` (LOW…URGENT), `status` (PENDING/IN_PROGRESS/DONE), `due_at`, `notes`, soft-delete
- API: `app/api/maintenance-tasks/`, `app/api/worker/maintenance-tasks/`
- UI: `app/(manager)/tasks/page.tsx`, `WorkerMaintenancePanel`
- הרשאות: nav `tasks` (`lib/client-nav-features.ts`), RLS `bamakor_my_client_ids()`, כתיבה `requireSessionWriteAccess`
- Overdue → המלצות: `lib/recommendations/detectors/maintenance-overdue.ts`

### מה חסר / חלקי
| פער | חומרה |
|-----|--------|
| אין FK / עמודה `ticket_id` (רק query `from_tickets` שלא נצרך ב־UI) | בינוני |
| אין התראת שיוך לעובד (SMS/WA/push) — בניגוד לתקלות | בינוני |
| אין recurrence / תתי־משימות / audit מלא | נמוך (MVP לא חייב) |
| סטטוסים דקים (אין BLOCKED/CANCELLED) | נמוך |

### שיפורים קטנים (מומלץ קודם)
1. **קישור משימה↔תקלה** — עמודה אופציונלית `source_ticket_id` + צריכת `from_tickets` ב־`/tasks`
2. **התראה בשיוך** — שימוש ב־`workers.notify_*` הקיימים (מ־105)
3. Prefill מלא מהמלצת `create_task`

### פיתוחים גדולים (דחויים)
- Recurrence / לוח תחזוקה מונע · תתי־משימות · SLA על משימות · עלות למשימה

| | |
|--|--|
| **מורכבות** | קטן: S · גדול: L |
| **סיכון** | נמוך אם additive + RLS זהה ל־105 |
| **תלות** | workers prefs, recommendations create_task |
| **השפעה** | זמן עד שיוך על עבודת אחזקה מתוכננת; לא שובר תקלות |

**הצלחה (שלב A):** משימה נוצרת מתקלה עם קישור נשמר; עובד מקבל התראה לפי prefs; smoke Bamakor ירוק; אין 5xx חדשים.

---

## 2) עדכונים אוטומטיים לדיירים

### מה קיים
- פתיחה: אישור לדייר (`ticket_opened`) ב־`dispatch-inbound`
- סגירה: `lib/reporter-ticket-closed-notify.ts` מ־`update-ticket` / `close-ticket` / worker complete / merge
- דגלים: `clients.sms_on_ticket_open` / `sms_on_ticket_close`
- לוג: `whatsapp_messages`, `failed_notifications`; dedupe webhook: `processed_webhooks`
- Pull: דייר שואל סטטוס → `ticket_status_list`

### מה חסר
- **אין push** כשסטטוס עובר ל־`IN_PROGRESS` / `WAITING_PARTS` / דומים
- Dedup לסגירה חלש (רק “כבר CLOSED”) — אין מפתח “כבר נשלח על מעבר X”
- אין opt-in פר־דייר לעדכוני סטטוס (רק ברמת לקוח)

### שיפור קטן–בינוני (מומלץ גבוה)
1. Helper יחיד `notifyReporterTicketStatusChanged` (מקביל ל־closed)
2. טריגר רק על מעברים מוגדרים (whitelist) מ־`update-ticket` + worker PATCH
3. **Idempotency:** טבלה קטנה / עמודה `last_resident_status_notified` או מפתח ב־`whatsapp_messages` / `ticket_logs`
4. תבנית Meta חדשה + מפתח ב־`whatsapp-template-keys.ts`
5. דגל לקוח חדש: `wa_on_ticket_status_change` (default off → on אחרי פיילוט)

| | |
|--|--|
| **מורכבות** | M |
| **סיכון** | בינוני — spam Meta / כפילויות / תבניות לא מאושרות |
| **תלות** | Meta template approval, credentials לקוח |
| **השפעה** | חוויית דייר; לא נוגע ב־middleware/RLS |

**הצלחה:** מעבר OPEN→IN_PROGRESS שולח הודעה אחת; retry לא שולח שוב; סגירה עדיין עובדת; `failed_notifications` + `whatsapp_messages` מתועדים; הגדרה כבויה = אין שליחה.

---

## 3) שיפור המלצות AI

### מה קיים (לא “AI לומד” — detectors + WhatsApp AI נפרד)
- `management_recommendations` + events — migration `115`
- Detectors: SLA unassigned, maintenance overdue, building volume/recurrence, collections, professional followup — `lib/recommendations/`
- Cron: `app/api/cron/management-recommendations` (cap ~40 clients)
- UI: Bell / AttentionRequired / actions (navigate, Midrag, create_task href, snooze)
- WhatsApp AI: rewrite + unknown-resident intake — `lib/whatsapp-ai*.ts`
- בדיקות יחידה: `tests/recommendations-*.test.ts`

### מה חסר
- דירוג עובד/ספק לפי היסטוריה (north-star)
- פעולה שמבצעת assign/create אוטומטית (כיום רק deep-link)
- Golden-set / eval harness לדיוק
- הקשר עשיר: ציוד, עלות, זמן פתרון ממוצע לבניין

### שיפורים קטנים
1. העשרת `facts` ב־detectors (avg time-to-assign לבניין/נושא)
2. מדידת `action_succeeded` מה־events הקיימים → דוח שבועי
3. צריכת `from_tickets` ב־create_task (חיבור למסלול 1)

### פיתוח בינוני (עדיפות north-star)
4. **`suggestWorkerForTicket`** — heuristic: אותו בניין + נושא + זמן פתרון קצר / פחות חזרות (בלי LLM בהתחלה)
5. כפתור “שייך מומלץ” שמבצע assign דרך API קיים
6. Eval fixtures: 20–50 תקלות labeled → precision@1

| | |
|--|--|
| **מורכבות** | S (מדידה) → M (suggest) → L (LLM ranking) |
| **סיכון** | בינוני אם auto-assign; נמוך אם המלצה+אישור מנהל |
| **תלות** | היסטוריית tickets/workers; לא לשנות middleware |
| **השפעה** | % ללא התערבות מנהל + זמן עד שיוך |

**הצלחה:** precision@1 ≥ baseline+15% על golden set; “שייך מומלץ” מצליח ב־smoke; אין עלייה ב־`CLIENTS_ACTIVE_QUERY_FAILED`.

---

## 4) העברת מידע ממערכת קודמת

### מה קיים
- ייבוא דיירים: CSV/xlsx/PDF — `ImportResidentsModal`, `/api/import-residents`, bulk superadmin, `dryRun`, dedupe טלפון+פרויקט
- סכמה: `projects`, `residents`, `tickets`, `workers`, `ticket_attachments`, `ticket_logs`, `audit_log`
- Fixly = מדריך מקצוענים בלבד — **לא** מקור מיגרציית לקוח

### מה חסר
- ייבוא tickets / workers / קבצים / היסטוריה / בניינים ייעודי
- ETL mapping ממערכת בשם + ID map + rollback
- Dry-run מולטי־ישות

### תוכנית בלבד (אין ביצוע)

```
שלב 0  קבלת דוגמת export (CSV/API) מהמערכת הישנה + אישור בעלים
שלב 1  מיפוי שדות → טבלאות BINO + כללי dedupe
שלב 2  Importer dry-run (validate + report כפילויות) — כתיבה ל־staging client בלבד
שלב 3  ייבוא buildings/workers → residents (קיים) → tickets (ללא התראות) → attachments
שלב 4  אימות ספירות + RLS cross-tenant + כיבוי webhooks בזמן ייבוא
שלב 5  Cutover + שמירת ID map
```

| ישות | יעד BINO | סיכון כפילות |
|------|----------|--------------|
| בניין | `projects` (+ `project_buildings` אם יחידות) | שם+כתובת |
| דייר | `residents` | `normalized_phone`+`project_id` (קיים) |
| עובד | `workers` | טלפון+client |
| תקלה | `tickets` | external_id חדש / hash |
| קובץ | storage + `ticket_attachments` | path ייחודי |
| היסטוריה | `ticket_logs` | append-only אחרי ticket |

| | |
|--|--|
| **מורכבות** | L |
| **סיכון** | גבוה — זיהום נתונים, התראות המוניות |
| **תלות** | דוגמת קובץ לקוח; אישור כתוב לפני כל write |
| **השפעה** | onboarding לקוחות; לא משנה runtime יומיומי אם מבודד |

**הצלחה (לפני ייבוא אמיתי):** דוח dry-run עם 0 שגיאות קריטיות; sandbox client עם N בניינים/דיירים תואם מקור ±1%; אין הודעות WA/SMS בזמן ייבוא.

---

## 5) קיבולת וביצועים

### מה קיים
- אינדקסים: migrations `106`, `120`, ועוד לפי דומיין
- רשימות עם caps: tickets 200, residents/tasks 100, dashboard 50
- Caches: middleware tenant 5 דק', RQ 60s, WhatsApp tenant 60s
- KPI RPC: `dashboard_ticket_kpi_counts`
- RLS: `client_id IN bamakor_my_client_ids()`; middleware עם **service role** בלבד
- Docs: `PERFORMANCE_PAGE_PLAN.md`, `PERF_POST_LOGIN_*`, `LOAD_TEST_ISOLATED_*` (prod אסור)
- Storage: attachments ≤16 MiB

### צווארי בקבוק ידועים / צפויים בקנה מידה
| אזור | היום | ב־10× לקוחות/בניינים |
|------|------|----------------------|
| Tickets open | ~OK @ ~150 rows | re-EXPLAIN; אולי partial index / pagination מלאה |
| Recommendations cron | 40 clients/run | fairness queue / batch גדול יותר בזהירות |
| Sales leads in-memory | ~8k | DB upsert לפני ~10k |
| Middleware | cookie HMAC | שמור admin path — **אל תשנה ל־JWT** |
| Disk IO attachments | per-ticket paths | lifecycle/purge לפי `STORAGE_BACKUP_POLICY` |

### שיפורים לפי השפעה / עלות / מורכבות

| שיפור | השפעה | עלות | מורכבות | מתי |
|-------|--------|------|---------|-----|
| מדידת EXPLAIN בסף 5k/10k tickets | גבוהה | נמוכה | S | עכשיו כ־gate |
| Virtualization desktop ברשימות | בינונית | נמוכה | S | כש־tenant >1k שורות UI |
| Cron recommendations הוגן | בינונית | נמוכה | M | >40 לקוחות פעילים |
| Sales leads DB lookup | גבוהה בזמן מכירות | בינונית | M | לפני 10k leads |
| CDN/image pipeline | נמוכה–בינונית | בינונית | M | אחרי תלונות IO |
| שינוי RLS רחב | — | גבוהה | L | **לא** בלי אירוע + אישור |

**הצלחה:** p95 רשימת תקלות פתוחות < 300ms ב־EXPLAIN אחרי סף; Bamakor smoke ירוק; אין הצפת middleware 503; load רק מול local (`npm run load:isolated`).

---

## 6) אפליקציה ל־App Store

### מה קיים
- **WKWebView shell** ב־`ios/BINO/` (לא Capacitor) — bundle `casa.bino.app`, UA `BinoIOS`, OAuth `bino://` + `lib/native-shell.ts`
- PWA: `public/sw.js`, manifests, Web Push VAPID
- AASA builder: `lib/apple-app-site-association.ts` — **404 עד `APPLE_TEAM_ID`**
- מצלמה: `capture=environment` + usage strings ב־Xcode
- NFC: מודל URL stickers (`/worker/nfc`) — **אין CoreNFC**

### השוואה

| גישה | עלות/מהירות | App Store | התראות | מצלמה | NFC | המלצה |
|------|-------------|-----------|--------|--------|-----|--------|
| PWA בלבד | הזול ביותר | לא | Web Push (מגבלות iOS) | כן (web) | URL | השלמה ל־Home Screen |
| **WKWebView wrap (קיים)** | זול ומהיר | כן (עם מדיניות Apple) | Web Push בתוך web; APNs נפרד אם יידרש | כן | URL מספיק | **ברירת מחדל** |
| Capacitor | כפילות מול shell | כן | plugins | כן | plugin | לא — כפילות |
| Native מלא | יקר | כן | APNs | native | CoreNFC | רק אם UX ייעודי יידרש |

### המלצת CTO
1. **לא להתחיל המרה/שכתוב** — להשלים את ה־shell הקיים אחרי אישור.
2. Owner: `APPLE_TEAM_ID`, Associated Domains חיים, Privacy Nutrition, חשבון Apple Developer.
3. לשמור NFC כ־URL tags; CoreNFC רק אם חובה בלי דפדפן.
4. PWA נשאר לנתיב Android / התקנה מהירה.

| | |
|--|--|
| **מורכבות** | M (השלמת shell) · XL (native rewrite) |
| **סיכון** | בינוני — App Review (4.2 Minimal Functionality) אם “אתר עטוף” בלי ערך native |
| **תלות** | אישור בעלים + Apple account |
| **השפעה** | ערוץ הפצה; לא משנה backend אם רק shell |

**הצלחה:** Login Google ב־shell → dashboard; AASA 200; מצלמה בפורטל עובד; Review notes מסבירות OAuth native + offline attendance/NFC URL.

---

## סדר ביצוע מומלץ (עסקי + טכני)

```
P0  יציבות/ביצועים gate     — מדידה + איסור שינויי middleware/RLS ספקולטיביים
P1  עדכוני סטטוס לדייר      — ערך לקוח גבוה, תשתיות WA קיימות
P2  משימות: ticket link + notify assign — שיפור קטן על בסיס קיים
P3  המלצות: suggestWorker + evals     — north-star בלי LLM כבד
P4  ייבוא: מיפוי + dry-run tooling    — רק אחרי דוגמת לקוח + אישור
P5  iOS shell ship                    — רק אחרי אישור גישה/חשבון Apple
```

### הפרדה: קטן מול גדול

| קטן (ימים קצרים של עבודה ממוקדת) | גדול (אפיון + אישור נפרד) |
|----------------------------------|---------------------------|
| `source_ticket_id` + notify assign | Recurrence / PM מלא |
| Status-change WA + idempotency | Opt-in פר־דייר + פורטל דיירים מלא |
| suggestWorker heuristic + golden set | LLM ranking / auto-assign ללא מנהל |
| Dry-run importer tickets CSV | Cutover מלא + קבצים + היסטוריה |
| EXPLAIN gates / virtualization | שינוי ארכיטקטורת RLS |
| AASA + TestFlight ל־shell | Native rewrite / Capacitor |

---

## קבצים וטבלאות מרכזיים (אינדקס)

| מסלול | קבצים / טבלאות |
|--------|----------------|
| משימות | `105_maintenance_tasks_*.sql`, `app/api/maintenance-tasks/*`, `app/(manager)/tasks/page.tsx`, `lib/maintenance-task-day.ts` |
| דייר/סטטוס | `lib/reporter-ticket-closed-notify.ts`, `app/api/update-ticket/route.ts`, `lib/whatsapp-resident-outbound.ts`, `whatsapp_messages`, `failed_notifications` |
| המלצות | `115_management_recommendations.sql`, `lib/recommendations/**`, `app/api/recommendations/**`, `lib/whatsapp-ai.ts` |
| ייבוא | `lib/bulk-import-residents.ts`, `app/api/import-residents/route.ts`, `ImportResidentsModal.tsx` |
| ביצועים | `106`/`120` migrations, `middleware.ts`, `lib/middleware-tenant-cache.ts`, `docs/PERFORMANCE_PAGE_PLAN.md` |
| iOS | `ios/BINO/**`, `lib/native-shell.ts`, `lib/apple-app-site-association.ts`, `public/sw.js` |

---

## כללי עבודה (חובה לפני כל שלב ביצוע)

1. הצג PR ממוקד למסלול אחד — **לא** לערבב middleware/RLS עם פיצ׳ר.
2. אין migration / GRANT / ייבוא / TestFlight בלי אישור כתוב בשיחה.
3. אחרי שינוי runtime: `npm run test:bamakor-smoke` + בדיקת runtime errors (P0 signatures).
4. אין load test מול `bino.casa` / Bamakor prod.
5. אין Supabase preview branches בתשלום.

---

## מה מבוקש מהבעלים עכשיו

1. אשר סדר עדיפויות (או שנה).  
2. בחר מסלול ראשון לביצוע (מומלץ: **P1 עדכוני דייר** או **P2 משימות**).  
3. לייבוא: ספק דוגמת CSV/API מהמערכת הישנה.  
4. ל־iOS: אשר גישה ל־Apple Developer + האם להציב `APPLE_TEAM_ID`.
