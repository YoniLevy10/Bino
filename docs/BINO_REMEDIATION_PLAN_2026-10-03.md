# BINO — תוכנית תיקון מוכנות להתרחבות (2026-10-03)

**סטטוס:** ביצוע מדורג פעיל (קוד/בדיקות/docs בלבד — **ללא** apply/deploy לפרוד עד אישור מפורש אחרי חבילת apply).  
**מקור ממצאים:** [`BINO_PAYING_CUSTOMERS_READINESS_AUDIT_HE_2026-10-03.md`](./BINO_PAYING_CUSTOMERS_READINESS_AUDIT_HE_2026-10-03.md)  
**קוד בסיס:** `main` @ `da9fcb3` (+ PRs יישום נפרדים)  
**עדכון מסמך:** 2026-10-03 (אישור owner ליישום מדורג + הבהרות D1–D7)

---

## 1. מטרה ומסלולי Go/No-Go

יעד השחרור הראשון (**D6**): **ניהול בניינים**. גבייה = אישור מוכנות נפרד.

| מסלול | חוסמים מרכזיים | לא מספיק |
|--------|----------------|----------|
| **ניהול בניינים** | 111 REVOKE+UNIQUE WA · WriteAccess · מטריצת הרשאות · restore · smoke login · **מדידת nav/PWA אחרי login** · **ניטור runtime נגיש** · **פגיעות Next קריטית מתוקנת בפרוד** | TTFB ציבורי; CI ירוק בלבד |
| **גבייה** | כל תנאי בניינים + **מיגרציה 113** + תיקוני Grow + סיווג 4 חריגות + E2E sandbox (+ invoice אם בחוזה) | paid=ok היסטורי חלקי |
| **עומס 50–100** | load test מבודד · אינדקסים/IO · עלויות הודעות/AI | עומס של 2 לקוחות |

### סתירת מיגרציה 113 — פסיקה

**113 חוסמת Go גבייה בלבד — לא Go ניהול בניינים.**

| שאלה | תשובה |
|------|--------|
| מה משנה 113? | עמודה `collection_charges.idempotency_key` + UNIQUE חלקי |
| האם נתיבי תקלות/דיירים/עובדים תלויים בה? | **לא** |
| למה לא חוסם בניינים? | בלי addon גבייה הקוד לא כותב לעמודה; יצירת חיוב עם `Idempotency-Key` נכשלת רק במסלול גבייה |
| סיכון צדדי | אם מפעילים גבייה לפני apply 113 — create עם הכותרת עלול להישבר. לכן: **אל תפעילו addon גבייה ללקוח חדש לפני 113** |

מיגרציות **111 / 112 / `system_logs`** כן רלוונטיות ל־Go בניינים (אבטחה / soft-delete / health).

---

## 2. אימות ממצאים (חי, 2026-10-03)

| ממצא | סטטוס | ראיה |
|------|--------|------|
| B1/H1 — 111 | פתוח בפרוד | `has_wa_uidx=false`; REVOKE לא הוחל; `wa_dup_groups=0` (בטוח ל־UNIQUE) |
| B2 — 113 | פתוח בפרוד | `has_idempotency=false` |
| H8 — 112 | פתוח בפרוד | `has_deleted_at=false`; קוד soft-delete קיים |
| H4 — system_logs | פתוח | `has_system_logs=false` |
| `nfc_tags` vs `worker_nfc_tags` | פער ב־111 | `nfc_tags` לא קיים; `worker_nfc_tags` כן — נדרש REVOKE משלים |
| כתיבות דפדפן לטבלאות 111 | לא נמצאו | מוטציות דרך API + admin |
| H7 Next | **קריטי חל על App Router** | `next@16.2.1` ∈ affected של [GHSA-8h8q-6873-q5fj](https://github.com/advisories/GHSA-8h8q-6873-q5fj) (CVE-2026-23870); patched ≥**16.2.5** (רשמי). npm latest 16.3.8 |
| xlsx | high, אין fix npm | חשיפה: פרסור Excel בדפדפן מנהל בלבד |

---

## 3. החלטות Owner (D1–D7) — מעודכן

| # | החלטה | סטטוס | הנחיה ליישום |
|---|--------|--------|----------------|
| **D1** | Apply מיגרציות לפרוד | **ממתין לאישור אחרי חבילה** | מכינים חבילת apply + prechecks + rollback; **מציגים לפני החלה**; אין apply בלי OK מפורש |
| **D2** | Grow sandbox / טננט בדיקה | בבדיקת גישות | קודם שימוש במקומי/קיים; **לא** ליצור שירות בתשלום |
| **D3** | 4 חיובים חריגים | **סיווג READ-ONLY בוצע** — ממתין להחלטת טיפול | אין שינוי סטטוס/Approve בדיעבד עד החלטה אחרי הראיות (ראה §8) |
| **D4** | משתמשי בדיקה | בבדיקת גישות | מבחני viewer ב־unit/mocks קודם; cross-tenant חי רק עם credentials |
| **D5** | Restore venue | בבדיקת גישות | local dump/restore; לא preview בתשלום |
| **D6** | יעד שחרור ראשון | **נקבע: ניהול בניינים** | גבייה = Go נפרד |
| **D7** | MFA / הגנת report | **לא נדחו** | מציגים חשיפה+פתרון+מאמץ; כולל rate-limit/מכסות ל־report — לא רק HMAC |

---

## 4. חבילות ביצוע — מאמץ (עבודה מול המתנה)

הערכות ב־**ימי־עבודה אפקטיביים** (לא לוח שנה). עמודת «המתנה» = גישה/ספק/אישור owner.

| חבילה | תוכן | עבודה | המתנה | חוסם Go |
|--------|------|--------|--------|---------|
| **P0-Docs** | עדכון תוכנית + חבילת apply + סיווג חיובים | 0.5–1 | — | — |
| **P1-WriteAccess** | שערי כתיבה + בדיקות viewer | 1–2 | D4 ל־E2E חי | בניינים |
| **P2-GrowCode** | sum/Approve/wallet + unit tests | 1.5–2.5 | אימות docs Grow (חלקי) | גבייה |
| **P3-FalseSuccess** | toasts גבייה | 0.5 | — | גבייה (UX) |
| **P4-DepsNext** | bump Next ≥16.2.5 (מומלץ latest patched 16.x) | 0.5–1.5 | — | **בניינים** (קריטי חל) |
| **P5-Xlsx** | mitigation / החלפה | 1–2 | בחירת ספרייה/רישיון | מומלץ לפני בניינים |
| **P6-MigPrep** | precheck SQL, סדר, rollback docs | 0.5–1 | **D1 אישור** לפני apply | apply עצמו |
| **P7-PerfPWA** | מדידת nav אחרי login + SW | 1–3 | session בדיקה | **בניינים** |
| **P8-RuntimeObs** | Vercel/Sentry נגיש לצוות | 0.5 | הרשאת scope | **בניינים** |
| **P9-Restore** | תרגיל RTO/RPO | 1–2 | D5 | **בניינים** |
| **P10-ReportAbuse** | rate-limit + מכסות (+ HMAC אופציונלי) | 1–2 | — | מומלץ בניינים |
| **P11-MFA** | superadmin זהות+MFA | 3–5 | החלטת מוצר | אחרי Go ראשון אפשרי אך **לא מסומן נדחה** — נדרש לוח זמנים |
| **P12-CollE2E** | Grow sandbox E2E | 2–4 | D2 | גבייה |
| **P13-Scale** | load/indexes/AI caps | 3–6 | env עומס | 50–100 |

---

## 5. תנאי Go בניינים (מעודכן)

חובה לפני לקוח משלם חדש (ניהול בניינים):

1. **111 (+ REVOKE ל־`worker_nfc_tags`)** הוחל ומאומת; PostgREST כתיבה חסומה.  
2. **112** הוחל; soft-delete עובד.  
3. **`system_logs`** קיים ו־health כותב.  
4. WriteAccess לצופה סגור + בדיקות (unit לפחות; חי אם יש D4).  
5. Smoke: login → dashboard → תקלה שיוך/סגירה בלי middleware 503.  
6. **מדידת ביצועים אחרי login** (warm/cold nav למסכי ליבה) + תיקון תקיעות PWA שזוהו — מתועד עם p50/p95.  
7. **ניטור runtime** נגיש לצוות (Vercel errors ו/או Sentry פעיל מאומת).  
8. **Next מתוקן** לגרסה ≥16.2.5 לפי advisory רשמי (או חדשה יותר שסוגרת את כל ה־GHSA הפתוחים).  
9. Restore drill מתועד (RTO/RPO + מה לא משוחזר).  
10. **לא** נדרש: 113, E2E Grow, MFA (אבל MFA חייב לוח זמנים מפורסם — לא «נדחה באישור»).

### Go גבייה (נפרד)

כל Go בניינים + 113 + P2-GrowCode בפרוד + סיווג D3 עם החלטת טיפול + P12 E2E + false-success.

---

## 6. הגנת `/report` — לא רק HMAC (M11 / P10)

| שכבה | תפקיד | תאימות ל־QR קיימים |
|------|--------|---------------------|
| **Rate limit לפי IP + client_id** | בלימת ספאם | כן — לא שובר קישורים ישנים |
| **מכסת דיווח ציבורי יומית/שעתית per client** | הגנת plan limits | כן |
| **לוג/ops alert בחריגה** | זיהוי מוקדם | כן |
| **HMAC / token מורחב** (אופציונלי בהדרגה) | קישור חתום ללקוחות חדשים | קישורים ישנים נשארים עם RL+מכסה; feature-flag |

אין לסמוך על חתימת קישור כשכבה יחידה.

---

## 7. MFA סופר־אדמין (M5 / P11) — חשיפה / פתרון / מאמץ

| | |
|--|--|
| **חשיפה** | `ADMIN_SETUP_SECRET` ב־sessionStorage/localStorage — גניבת סוד = שליטה בפעולות פלטפורמה |
| **פתרון** | זהות משתמש (Supabase Auth) + MFA + audit actor; ביטול persist של secret גולמי |
| **מאמץ** | 3–5 ימי עבודה + תקופת מעבר |
| **סטטוס** | **לא נדחה**. לא חוסם Go בניינים הראשון אם יש 1–2 ops וסוד חזק, אך חייב תאריך יעד מפורסם לפני scale |

---

## 8. סיווג READ-ONLY — 4 חיובים paid בלי approve=ok (D3)

מקור: Bamakor, ספירות בלבד + מזהי שורה פנימיים. **לא שונה סטטוס.**

| מחלקה | n | מאפיינים | מסקנה |
|--------|---|----------|--------|
| **A — mark-paid ידני** | 2 | created ~2026-09-06; אין txn/token/link/process; `grow_approve_status` null | תואם `markCollectionChargePaidManual` שמעדכן רק `status=paid` בלי שדה approve |
| **B — תשלום Grow בלי Approve** | 2 | created ~2026-09-28; יש `grow_transaction_id` + payment_link; **אין** token; approve null | סביר callback/סימון ששולם בלי credentials ל־Approve (או נתיב ישן). **לא** לאשר Approve בדיעבד בלי התאמה לחשבון Grow |

**ממתין ל־owner:** לכל מחלקה — (1) להשאיר מתועד כ־manual/pending-approve, (2) להוסיף סטטוס מפורש `manual` בקוד לעתיד בלבד, (3) בדיקה ידנית מול Grow ל־מחלקה B.  
פירוט: [`COLLECTION_CHARGE_ANOMALY_CLASSIFICATION_2026-10-03.md`](./COLLECTION_CHARGE_ANOMALY_CLASSIFICATION_2026-10-03.md)

---

## 9. חבילת Apply (D1) — ללא החלה

ראה [`MIGRATION_APPLY_PACKAGE_111_112_113.md`](./MIGRATION_APPLY_PACKAGE_111_112_113.md):

- Prechecks שבוצעו: אין כפילויות WA; אין `deleted_at`/`idempotency_key`/`system_logs`; `worker_nfc_tags` קיים.  
- סדר מוצע: system_logs → 112 → 111 (+ revoke worker_nfc_tags) → **113 רק לפני Go גבייה** (או באותו חלון אם רוצים, אך לא חוסם בניינים).  
- Rollback מתועד.  
- **ממתין להצגה + אישור owner לפני כל apply לפרוד.**

---

## 10. מיפוי ממצאים → חבילות

| ID | חבילה | הערת סגירה |
|----|--------|------------|
| B1 H1 | P6 + apply 111 | סגירה רק אחרי apply+ראיה |
| B2 | P6 + apply 113 | **Go גבייה בלבד** |
| B3 | §8 / D3 | סיווג בוצע; טיפול אחרי החלטה |
| B4 | P12 | גבייה |
| B5 | P9 | Go בניינים |
| H2 H3 M2 M3 | P2 | קוד+טסטים; סגירה מלאה אחרי deploy |
| H4 | P6 system_logs | אחרי apply |
| H5 M9-API | P1 | |
| M9-UX | P3 | |
| H6 | בעקבות P1/P2 | |
| H7 | P4 (+P5) | Next = לפני לקוח חדש |
| H8 | P6+112 | |
| M1 | מיגרציית is_active אחרי 111 | |
| M5 | P11 | לא נדחה |
| M6 M7 | P13 / perf | |
| M8 | P2 מינימום + המשך | |
| M10 | P8 | Go בניינים |
| M11 | P10 | RL+מכסות; HMAC משני |

---

## 11. מגבלות גישה נוכחיות (חסמים ממוקדים)

| חסר | השפעה | מה ממשיכים בלעדיו |
|-----|--------|-------------------|
| אין `.env.local` / session בדיקה | אין מדידת nav מאומתת אחרי login בסוכן | מדידות ציבוריות + תכנון SW; P7 חלקי |
| Vercel runtime 403 | אין אשכולות שגיאה חיים | P8 דורש re-auth owner |
| אין Grow sandbox credentials | אין E2E תשלום | P2 unit tests |
| אין משתמשי viewer חיים | אין E2E cross-tenant חי | unit/mocks ל־WriteAccess |
| אין supabase CLI מקומי מקושר | restore drill מקומי מוגבל | תיעוד הליך + prechecks SQL דרך MCP |

---

## 12. כללי סגירת ממצאים ב־PR

כל PR יציין:

1. אילו ממצאים נסגרים / **ממתינים לפריסה** / נשארים פתוחים  
2. מה השתנה  
3. מה נבדק (פקודות + תוצאה)  
4. מה לא אומת  
5. סיכוני פריסה / rollback  

ממצא DB נסגר רק עם ראיה מ־Bamakor אחרי apply. ממצא קוד יכול להיות «תוקן בקוד — ממתין לפריסה».
