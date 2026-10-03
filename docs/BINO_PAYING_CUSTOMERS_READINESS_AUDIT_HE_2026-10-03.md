# BINO — ביקורת מוכנות להתרחבות עם לקוחות משלמים

**תאריך:** 2026-10-03  
**גרסת קוד שנבדקה:** `main` @ `da9fcb3` (כולל #228 OAuth cookies)  
**ייצור:** `https://bino.casa` · Supabase Bamakor `jsliqlmjksintyigkulq` · Vercel project `bino`  
**סוג ביקורת:** בדיקות בלבד — ללא שינוי קוד, הגדרות, נתונים, הרשאות או תשתיות.  
**סוכנים מקבילים:** אבטחה · ביצועים · תשלומים · UX/תפקידים · אמינות · איכות/עלויות — אוחדו ואומתו כאן.

---

## 1. החלטה

### מוכן בתנאים — לא להרחיב לקוחות משלמים חדשים לפני סגירת חוסמים

המערכת **פועלת בפיילוט** עם שני לקוחות פעילים ועומס נמוך מאוד. תיקוני קוד רבים מביקורת 30.09 נמצאים ב־`main` וחלקם אומתו חי (middleware ציבורי, webhooks ללא session, חתימת WhatsApp fail-closed, Approve-לפני-paid במסלול העיקרי).

עם זאת, **אין בסיס עסקי להכריז על מוכנות להתרחבות**:

1. מיגרציות hardening קריטיות (**111 / 112 / 113**) קיימות בריפו אך **לא הוחלו ב־Bamakor** — הכתיבה הישירה ב־PostgREST לטבלאות ליבה עדיין פתוחה ל־`authenticated`, ו־idempotency של חיובים חסר בפרוד.
2. יש **אי־עקביות כספית חיה**: 4 חיובים `paid` בלי `grow_approve_status=ok` (מתוכם 2 עם `grow_transaction_id`).
3. **לא בוצע** E2E Grow sandbox מבודד בביקורת זו; שרשרת חשבונית לא מוכחת בפרוד (0 invoices משויכות).
4. **שחזור מגיבוי לא הוכח**; אין סביבה מבודדת לתרגול.
5. CI ירוק (591 unit + build) **אינו** מוכיח login/גבייה/WhatsApp חי.

**פיילוט נוכחי יכול להמשיך** עם ניטור מוגבר.  
**לקוחות משלמים חדשים (במיוחד עם גבייה)** — רק אחרי תנאי הקבלה בסעיף 6.

---

## 2. מה אומת / מה מבוסס / מה לא נבדק

### אומת בפועל (ראיות חיות או קוד+סכמה)

| נושא | ראיה |
|------|------|
| 2 לקוחות פעילים, עומס נמוך | SQL: Bamakor 782 דיירים / סביון 32; `feature_page_views` 14י׳: 474 צפיות, 5 משתמשים; שיא שעה ~3 users |
| DB ~29MB, cache hit ~100%, ללא נעילות | SQL + advisors |
| מיגרציות 111/112/113 **לא** ב־prod | `list_migrations` + `information_schema` / `pg_indexes` |
| `authenticated` INSERT/UPDATE/DELETE על tickets/residents/charges/… | `has_table_privilege` = true; RLS `FOR ALL` |
| `idempotency_key` / `projects.deleted_at` / unique WA phone — חסרים | SQL |
| חיובים: 8 paid (4 ok / 4 null approve); 0 invoices | `GROUP BY` על `collection_charges` |
| HTTP: APIs מוגנים → 401; create-ticket בלי client → 401; Grow בלי token → 401; WA בלי חתימה → 403 | curl ל־bino.casa |
| TTFB דפים ציבוריים ~75–150ms | curl (n קטן — אין p95 אמין) |
| Vitest 591 עברו; tsc ירוק; `next build` הצליח | הרצה מקומית |
| Middleware חורג create-ticket + webhooks; Approve-before-paid במסלול עיקרי | קוד `middleware.ts`, `webhook/grow/route.ts` |
| `system_logs` חסרה בפרוד | `to_regclass` = null |
| failed_notifications: 36 (4 ב־7י׳); error_logs 7י׳: 0 | SQL |
| Vercel runtime/deployments/envs מה־MCP | **403** אחרי auth — לא נמשך |

### מסקנה מבוססת (קוד + הקשר, בלי תרחיש חי מלא)

- צופה (`viewer`) יכול לכתוב בנתיבים שמשתמשים רק ב־`requireSessionClientId` (recommendations, attendance shifts, create-ticket מהדשבורד, חלק מקמפיינים).
- `bamakor_my_client_ids()` לא מסנן `is_active` — השבתת לקוח לא חוסמת RLS.
- Approve עלול לרוץ לפני בדיקת סכום; קריטריון הצלחה מקבל גם HTTP 200.
- עלויות @10 סבירות על Micro; @50–100 דורשות מדרגות compute/IO + תקציב הודעות — לא ליניארי.

### לא נבדק / חסום במכוון

| פער | סיבה |
|-----|------|
| Login מנהל / viewer / worker / resident חי | אין credentials בסביבת הסוכן |
| IDOR בין־טננטים עם שני sessions | אין שני משתמשי בדיקה |
| E2E Grow sandbox (הצלחה/כישלון/ביטול/כפל callback/חשבונית) | איסור כתיבה לטננט לקוח + סיכון חיוב אמת (Bit/Apple) |
| שליחת SMS/WhatsApp | איסור מפורש |
| Load test / p95 תחת עומס | איסור על production |
| Restore / PITR | אין סביבה מבודדת; לא בוצע |
| Vercel logs/errors/env names מלאים | 403 על scope הצוות |
| אימות `GROW_ENV` sandbox מול production | תלוי בגישת env |

---

## 3. מפת מערכת (מיפוי קצר)

```
דייר (WA/SMS/report/portal) → תקלה ב־Supabase (client_id)
מנהל (Google/session) → dashboard APIs (service role) + RLS לקריאה/כתיבה ישירה
עובד (token) → /api/worker/*
גבייה: מנהל יוצר חיוב → Grow link → דייר משלם → S2S /api/webhook/grow → Approve → paid → invoice webhook
פלטפורמה: Vercel (fra1) + 14 crons · Meta App אחת · 019 אחד · Grow platform keys · Resend
```

| מדד פרוד | ערך |
|----------|-----|
| לקוחות פעילים | 2 |
| בניינים / דיירים / תקלות | 36 / 814 / 139 |
| משתמשי org | 8 |
| חיובים | 16 (8 paid) |
| WhatsApp messages | 544 |
| גודל DB | ~29 MB |
| עלות compute מצוטטת | ~$10/mo (Micro-class) על org Pro |

מסמכים מול מימוש: `AUDIT_FINDINGS_STATUS` מצהיר «תוקן» על רבים מ־01–52 — **בקוד לרוב נכון**, אך **DB remediations 07/15/28/40 לא הוחלו** (מפורש גם בסטטוס כ«חסום apply»).

---

## 4. ממצאים מאוחדים (אחרי הסרת כפילויות)

חומרה: **חוסם** = חוסם לקוחות משלמים חדשים · **גבוה** · **בינוני** · **נמוך**  
ודאות: **מאומת** · **מסקנה מבוססת** · **חשד**

### חוסמים

#### B1 — כתיבה ישירה של `authenticated` לטבלאות ליבה (Audit #07)

| שדה | ערך |
|-----|-----|
| חומרה | חוסם |
| ודאות | מאומת |
| ראיות | `has_table_privilege('authenticated', tickets/residents/collection_charges/…, INSERT/UPDATE/DELETE)=true`; RLS `authenticated_tenant_*` עם `polcmd=*`; מיגרציה `111_audit_whatsapp_phone_unique_and_rls_writes.sql` לא ב־`schema_migrations` |
| שחזור | JWT מחובר → PostgREST `PATCH` על tickets/charges של אותו client_id → עוקף `requireSessionWriteAccess`, quota, לוגיקת גבייה |
| השפעה | צופה/מנהל משנים כסף/תקלות מחוץ ל־API; API אינו מקור אמת |
| תיקון | Apply מבוקר של 111 (REVOKE כתיבה מ־authenticated/anon) אחרי בדיקת כפילויות WA |
| מאמץ | S |
| אימות | `has_table_privilege(...,'INSERT')=false`; PostgREST כתיבה נכשלת; API service-role עובד |

#### B2 — idempotency חיובים חסר בפרוד (Audit #28 / מיגרציה 113)

| שדה | ערך |
|-----|-----|
| חומרה | חוסם (ללקוחות גבייה) |
| ודאות | מאומת |
| ראיות | עמודה `idempotency_key` לא קיימת; קוד `collections/charges` כותב אליה כשיש `Idempotency-Key` |
| שחזור | יצירה עם הכותרת → שגיאת schema; בלי כותרת → כפילות ב־retry |
| השפעה | כפלי חיובים / כשל יצירה; סיכון כספי ותפעולי |
| תיקון | Apply `113_audit_collection_charge_idempotency.sql`; להוסיף idempotency גם ל־bulk-send |
| מאמץ | S (apply) + M (bulk) |
| אימות | עמודה+UNIQUE; create כפול → `idempotent_replay` |

#### B3 — חיובים paid בלי Approve ok בפרוד

| שדה | ערך |
|-----|-----|
| חומרה | חוסם (אמון בגבייה) |
| ודאות | מאומת (ספירות) |
| ראיות | 4× `status=paid` + `grow_approve_status IS NULL`; מתוכם 2 עם `grow_transaction_id`; 0 עם invoice |
| שחזור | שאילתת COUNT (ללא PII) |
| השפעה | ספרים לא תואמים Grow; סיכון מחלוקת מול לקוח/דייר; go-live docs דורשים approve=ok |
| תיקון | חקירת מקור (mark-paid ידני / callback ישן / בלי token); השלמת Approve או תיעוד ידני; מניעת paid בלי credentials כשאפשר |
| מאמץ | M |
| אימות | anomaly count = 0; מדיניות ברורה ל־mark-paid ידני |

#### B4 — אין E2E Grow sandbox מאומת לפני מכירת גבייה

| שדה | ערך |
|-----|-----|
| חומרה | חוסם (למכירת גבייה) |
| ודאות | מאומת (פער בדיקה) |
| ראיות | `PAYMENTS.md`: בלי callback אמיתי — לא מוכרים; בביקורת זו לא נוצרו חיובים/תשלומים |
| שחזור | — |
| השפעה | אי אפשר להבטיח הצלחה/כישלון/ביטול/כפל/חשבונית ללקוח חדש |
| תיקון | טננט/סביבה מבודדת + סנדבוקס Grow; תרחישי success/fail/cancel/duplicate/invoice |
| מאמץ | M |
| אימות | צ׳קליסט `GROW_PRE_LIVE_CHECKLIST` / `COLLECTIONS_GO_LIVE` ירוק עם ראיות |

#### B5 — שחזור מגיבוי לא הוכח

| שדה | ערך |
|-----|-----|
| חומרה | חוסם (אמון תפעולי להתרחבות) |
| ודאות | מאומת (פער) |
| ראיות | אין תרגול restore; אין env מבודד; `get_project` בלי שדות PITR; מדיניות אוסרת preview בתשלום |
| שחזור | — |
| השפעה | כשל DB/מחיקה בטעות — אין הוכחה שאפשר לחזור |
| תיקון | לאשר PITR/backup ב־Dashboard; תרגול restore לסביבה מבודדת (לא preview יקר אם אפשר local) |
| מאמץ | M |
| אימות | מסמך restore מוצלח עם זמן RTO/RPO |

### גבוה

| מזהה | ממצא | ודאות | ראיה קצרה | מאמץ |
|------|--------|--------|------------|--------|
| H1 | אין UNIQUE על `whatsapp_phone_number_id` (חלק מ־111) | מאומת | index חסר; קוד מסרב עמימות ב־503 | S |
| H2 | Approve לפני בדיקת סכום (#19 שארית) | מאומת בקוד | `grow/route.ts` Approve ואז mark/sum | S |
| H3 | `approveGrowTransaction` מקבל HTTP 200 כהצלחה | מאומת בקוד | `grow-client.ts` ~243 | S |
| H4 | `system_logs` חסרה — health crons לא שומרים היסטוריה | מאומת | `to_regclass` null; crons insert | S |
| H5 | פערי WriteAccess לצופה (recommendations, shifts, create-ticket, campaigns…) | מסקנה מבוססת | `requireSessionClientId` בלבד בנתיבים | S–M |
| H6 | CI/E2E לא מכסים גבייה/WA/login חי | מאומת | vitest + playwright mocks/placeholders | M |
| H7 | תלויות: `xlsx` high + Next critical ב־npm audit | מאומת | `npm audit` | M |
| H8 | soft-delete פרויקטים — מיגרציה 112 לא הוחלה | מאומת | `projects.deleted_at` false | S |

### בינוני

| מזהה | ממצא | ודאות |
|------|--------|--------|
| M1 | `bamakor_my_client_ids` בלי סינון `is_active` | מאומת |
| M2 | מסלול משני webhook: paid ואז Approve | מסקנה מבוססת |
| M3 | wallet update בלי תנאי סטטוס | מאומת בקוד |
| M4 | אין חשבוניות Grow משויכות בפרוד | מאומת |
| M5 | Superadmin על סוד ב־localStorage (#10) | מאומת (מודל) |
| M6 | 51 FK ללא אינדקס; RLS initplan בפורטל דיירים | מאומת (advisors) |
| M7 | `feature_page_views` INSERT איטי (mean~133ms) | מאומת |
| M8 | Grow Approve בלי retry אוטומטי / ops alert | מאומת |
| M9 | UI לא מסתיר כתיבה מצופה; הצלחות מדומות חלקיות ב־SMS/bulk | מסקנה מבוססת |
| M10 | Vercel observability לא נגיש לביקורת (403) | מאומת |
| M11 | דיווח ציבורי עם UUID לקוח — סיכון ספאם מכסה | מסקנה מבוססת |

### נמוך / מידע

Storage uploads דרך service role; document-sign webhook לא מוגדר (fail-closed); advisors search_path; אינדקסים לא בשימוש; PWA cache; sales_leads עד ~8k בזיכרון.

---

## 5. תרחישים קריטיים שעברו (עם היקף)

| תרחיש | תוצאה | היקף |
|--------|--------|------|
| API מוגן בלי session | 401 | settings/update, update-ticket, collections, summary… |
| create-ticket בלי client_id | 401 | לא נוצרה תקלה |
| create-ticket UUID מזויף | 403 | לא נוצרה תקלה |
| Grow webhook בלי token | 401 | POST form |
| WhatsApp בלי חתימה | 403 | סוד קיים בפרוד |
| Fixly בלי סוד | 401 | handler הגיע (לא middleware session) |
| Cron בלי Bearer | 401 | דגימה |
| דפים ציבוריים /login /report /vaad-pay | 200, TTFB נמוך | curl קל |
| Unit + typecheck + build | ירוק | מקומי |
| Approve-before-paid (מסלול עיקרי) | קיים בקוד | סטטי + טסטים חלקיים על helpers |

---

## 6. קיבולת

**אין מספיק ראיות ל־p95 תחת עומס אמיתי של עשרות לקוחות.**  
מה שיש:

| מדד | ערך |
|-----|-----|
| לקוחות רשומים פעילים | 2 |
| משתמשים פעילים במקביל (הערכה מ־page views) | **1–3** בשיא שעה |
| DB | 29MB, חיבורים 25/60, cache ~100% |
| TTFB ציבורי | ~80–150ms (n קטן) |

**מסקנה:** כיום אין צוואר בקבוק קיבולת. צווארי בקבוק עתידיים צפויים מ־Disk IO/compute על Micro, webhooks+media, bulk SMS, ואינדקסי FK — לא מגודל הדיסק.

### תחזית עלות חודשית (פלטפורמה, סדרי גודל)

הנחות ללקוח ממוצע: 12 בניינים, 350 דיירים, 40 תקלות/חודש, 120 הודעות WA, 80 SMS; מחצית עם גבייה; Grow fees על הלקוח.

| | 10 לקוחות | 50 | 100 |
|---|-----------|-----|-----|
| Infra (Supabase+Vercel+Resend+AI) | ~$50–120 | ~$120–350 | ~$250–700 |
| SMS 019 (₪) | ~40–100 | ~200–500 | ~400–1,000 |
| WhatsApp Meta | ~$5–40 | ~$40–250 | ~$100–600 |

לא ליניארי: שדרוג Micro→Small/Medium; 1,000 service חינם **למספר**; crons קבועים; קמפיינים/גבייה יוצרים spikes.

---

## 7. תוכנית תיקונים מדורגת (ללא ביצוע בביקורת)

### שלב א׳ — לפני לקוח משלם נוסף (סיכון נתונים/כסף)

1. Apply **111** (REVOKE כתיבות + UNIQUE WhatsApp) אחרי ניקוי כפילויות.  
2. Apply **113** (idempotency חיובים).  
3. Apply **112** (soft-delete פרויקטים) או מיגרציה שקולה.  
4. יצירת `system_logs` אם עדיין נדרש ל־health.  
5. ניקוי/הסבר 4× paid ללא approve ok.  
6. תיקון סדר sum↔Approve + הקשחת קריטריון Approve.  
7. השלמת `requireSessionWriteAccess` בפערי צופה.  
8. E2E Grow sandbox מבודד (הצלחה + כשל + כפל + חשבונית אם רלוונטי).  
9. אימות שמות `GROW_*` / `GROW_ENV` ב־Vercel + גישת runtime logs לצוות.

### שלב ב׳ — לפני נפח / גבייה רחבה

- Retry/ops alert ל־Approve; idempotency bulk; #21/#22 מול Grow.  
- חתימת קישור `/report`; MFA לסופר־אדמין.  
- Route tests ל־grow/whatsapp/middleware; soft-launch smoke חי כשער.  
- Patch תלויות `xlsx` / Next CVE.  
- אינדקסי FK חמים + תיקון RLS initplan בפורטל דיירים.  
- הוכחת restore.

### שלב ג׳ — סקייל 50–100

- מעקב Disk IO / שדרוג compute; תקרת AI per-client; ניטור עלות SMS/WA; pagination/סיכומים שנותרו פתוחים (#29/#31/#44).

---

## 8. תנאי קבלה להכרזת «מוכן להתרחבות»

ניתן להכריז מוכן **רק** כשכל אלה ירוקים:

1. **DB:** 111+112+113 (או שקול) מיושמים ב־Bamakor; `has_table_privilege` INSERT ל־authenticated על ליבה = false; `idempotency_key`+UNIQUE קיימים; unique WA index קיים.  
2. **כסף:** 0 חיובים `paid` עם txn בלי `grow_approve_status=ok` (או מתועדים כ־manual עם סיבה); E2E sandbox עם callback אמיתי מתועד; אם מוכרים חשבוניות — לפחות מסמך אחד משויך.  
3. **הרשאות:** viewer מקבל 403 על כל מוטציות שנבדקו (כולל recommendations/shifts/campaigns/create-ticket מהדשבורד).  
4. **Smoke חי:** `CLIENT_SOFT_LAUNCH_SMOKE` ללקוח ניסיון — WA→תקלה, SMS, גבייה ₪1→שולם+approve, ללא middleware 503 אחרי login.  
5. **Ops:** health כותב לוג מתמשך; התראת platform ops מאומתת; **restore מתועד** לפחות פעם אחת בסביבה לא־פרוד.  
6. **Observability:** צוות רואה Vercel runtime errors 7י׳ בלי 403; Sentry DSN פעיל מאומת.  
7. **איכות שער:** בדיקות route ל־Grow Approve/sum ו־WA signature ב־CI; אין הסתמכות על «vitest ירוק» בלבד.

עד אז: **פיילוט מבוקר בלבד**, ללא onboarding המוני של לקוחות משלמים חדשים.

---

## 9. חוסמים — רשימה קצרה להחלטה

1. Apply מיגרציות 111 / 112 / 113 לפרוד (אחרי review).  
2. סגירת anomaly כספי (paid בלי approve) + תיקוני webhook Grow (sum/Approve criterion).  
3. E2E גבייה ב־sandbox מבודד.  
4. הוכחת גיבוי/שחזור.  
5. סגירת פערי צופה + soft-launch smoke חי.  
6. שחזור גישת ניטור Vercel לצוות.

---

## 10. נספח — מקורות סוכנים וגישות

| סוכן | קובץ עבודה |
|------|------------|
| מתאם | `/tmp/bino-audit/00-coordinator-evidence.md` |
| אבטחה | `/tmp/bino-audit/01-security.md` |
| ביצועים | `/tmp/bino-audit/02-performance.md` |
| תשלומים | `/tmp/bino-audit/03-payments.md` |
| UX/תפקידים | `/tmp/bino-audit/04-ux-flows.md` |
| אמינות | `/tmp/bino-audit/05-reliability.md` |
| איכות/עלויות | `/tmp/bino-audit/06-quality-costs.md` |

| חיבור | סטטוס |
|--------|--------|
| Supabase Bamakor | קריאה OK |
| Supabase advisors | OK |
| Vercel list project | OK |
| Vercel deployments/logs/envs | **403** |
| Grow sandbox E2E | לא בוצע |
| Auth sessions לבדיקת UI | לא זמין |
| Preview/isolated DB | לא נוצר (מדיניות עלות) |

ביקורת קודמת (סטטית בלבד): `docs/BINO_Read_Only_Audit_HE_2026-09-30.md` · סטטוס תיקונים: `docs/AUDIT_FINDINGS_STATUS_2026-09-30.md`.
