# מיגרציית גבייה: Grow → iCount (ישיר)

**החלטת בעלים:** עסקת Grow הסתיימה. גביית דיירים / VaadPay חייבת לעבור ל־**iCount API ישיר**.  
Financy→iCount = **ספרים בלבד** (receivables / draft receipt) — **לא** מחליף קישורי תשלום, IPN, או סימון «שולם».

צפון־כוכב: להמשיך גבייה + זיכרון תפעולי בלי תלות ב־Grow כספק.

---

## 1) מה מחליף את Grow — פיצ׳ר־פיצ׳ר

| יכולת Grow היום | תחליף iCount (ישיר) | Financy? | הערות |
|-----------------|---------------------|----------|--------|
| יצירת דרישת תשלום / payment link | `paypage` / `hk_api` session → URL דף תשלום | ❌ | חובה ל־P0 |
| כסף לחשבון הסולק של הבניין/הלקוח | iCount company (`cid`) + מסוף סליקה → חשבון בנק שמחובר ב־iCount | ❌ | ראו מודל ops למטה |
| Webhook S2S → סימון `paid` | IPN / `webhook` של iCount → `/api/webhook/icount` | ❌ | חובה ל־P0; idempotent כמו Grow |
| ApproveTransaction אחרי תשלום | אין מקביל ישיר — ב־iCount המסמך/העסקה נסגרים בצד שלהם | ❌ | לשמור סטטוס מסמך (`doc_id` / URL) |
| חשבונית / קבלה אוטומטית | הפקת מסמך ב־iCount (בדף תשלום או `doc/create`) | קריאה בלבד דרך Books | רו״ח מחליט doctype |
| ארנק SDK ב־`/pay` | לא ב־P0 — redirect ל־pay page של iCount | ❌ | P1 |
| SMS עם קישור Bino `/pay/{token}` | אותו מנגנון SMS; הקישור הפנימי מפנה ל־iCount | ❌ | P1 |
| GetLink / onboarding `userId` | אין — הזנת `cid` + token + `paypage_id` ידנית | ❌ | checklist בעלים |
| הוראת קבע (P1 Grow, כבוי) | `recurring` ב־paypage (אופציונלי) | ❌ | P2 / אחרי P0 יציב |
| זיכוי / refund | `doc` cancel/refund ב־iCount | ❌ | אחרי P0 |
| `grow_user_id` per building | `icount_*` per client תחילה; per project אם כל בניין = חברה נפרדת | ❌ | החלטת ops |
| התאמת דוחות / bank fee | AIS + PIS ב־Financy | ✅ Financy | עמלה לחברת ניהול = העברה בנקאית, לא סליקה |

**קוד Grow לא נמחק** עד שמסלול iCount עובר חיוב אמיתי + IPN + «שולם» בפרוד (או פיילוט מאושר). Dual-run: דגל פלטפורמה + `collections_payment_provider` / `icount_enabled` ללקוח.

---

## 2) מה הבעלים / הלקוח חייבים לספק

### ברמת פלטפורמה Bino (Vercel)

| פריט | חובה ל־P0? | הערה |
|------|------------|------|
| `ICOUNT_COLLECTIONS_ENABLED=true` | כן להפעלה | ברירת מחדל: כבוי — Grow נשאר |
| `ICOUNT_WEBHOOK_SECRET` | כן | `?token=` על IPN (כמו Grow) |

אין מפתחות פלטפורמה משותפים כמו `GROW_API_KEY` — כל לקוח מביא את ה־cid/token שלו.

### ברמת לקוח Bino (חברת ניהול) — מינימום P0

| שדה | מקור ב־iCount | חובה |
|-----|---------------|------|
| `icount_cid` | מזהה חברה (Company ID) | כן |
| `icount_api_token` | API Tokens (Bearer) — משתמש ייעודי מוגבל | כן |
| `icount_paypage_id` | דף תשלום קיים במערכת (או שנוצר מראש) | כן |
| מסוף סליקה / חשבון בנק ב־iCount | הגדרות iCount (לא ב־BINO) | כן — אחרת הכסף לא «לבניין» |
| אישור רו״ח לסוג מסמך | קבלה / חשבונית מס קבלה וכו׳ | לפני לייב |

### Per building או per company?

| מודל ops | המלצה טכנית |
|----------|-------------|
| **כסף נכנס לחשבון הבניין** + עמלת ניהול נמשכת אחר כך | עדיף **iCount company נפרד לכל בניין** (`cid` + paypage + terminal → חשבון הבניין). ב־BINO: שדות על `projects` (P1 אחרי client-level). |
| חברה אחת גובה לכל הבניינים לחשבון אחד | `cid` אחד על `clients` — פשוט יותר; לא תואם «חשבון בניין» בלי פיצול ידני. |
| עמלה לחברת הניהול | **לא** דרך iCount סליקה — אחרי אימות תשלום: Financy PIS / העברה ידנית מחשבון הבניין. |

**צ׳קליסט מהיר ללקוח:** cid · API token · paypage_id · מסוף פעיל · חשבון בנק מחובר במסוף · כתובת IPN ל־`https://bino.casa/api/webhook/icount?token=…` · מסמך ניסיון אחד.

---

## 3) מה Financy Pro **לא** עושה (ולכן לא מספיק)

| צורך VaadPay | Financy |
|--------------|---------|
| קישור «שלם עכשיו» לדייר | ❌ אין create payment page לדייר |
| Webhook שמסמן `collection_charges.paid` | ❌ webhook Financy = סטטוס העברות PIS |
| סליקה לחשבון Grow/iCount של הבניין | ❌ AIS קורא בנק; לא פותח דף אשראי לדייר |
| Draft receipt / receivables | ✅ תובנות ספרים בלבד |

Financy נשאר לשכבת **בנק + ספרים + משיכת עמלה**; הגבייה עצמה = **iCount ישיר**.

---

## 4) מפת touchpoints Grow ב־BINO (לא למחוק עדיין)

| אזור | קבצים / נתיבים עיקריים |
|------|-------------------------|
| לקוח Grow | `lib/grow-client.ts`, `lib/grow-config.ts`, `lib/grow-credentials.ts`, `lib/project-grow.ts` |
| שליחת חיוב | `lib/collection-charge-ops.ts`, `app/api/collections/charges/send`, `bulk-send` |
| `/pay` ציבורי + ארנק | `app/api/public/pay/[token]`, `…/wallet` |
| Webhooks | `/api/webhook/grow`, `grow-register`, `grow-invoice` |
| הגדרות | `grow_user_id` / `grow_enabled` על `clients` + `projects` (מיגרציה 092/125) |
| Env | `GROW_*`, `GROW_P1_*` |
| UI | Collections board, Settings Grow, VaadPay, Sandbox lab |
| Docs | `docs/PAYMENTS.md`, `docs/GROW_PRE_LIVE_CHECKLIST.md` |

Scaffold iCount (מיגרציה זו): עמודות `clients.icount_*`, דגל `ICOUNT_COLLECTIONS_ENABLED`, stub webhook — **בלי** ניתוק Grow.

---

## 5) שלבי בנייה

### P0 — חובה להמשך גבייה (יעד: 1–2 שבועות אחרי credentials + sandbox)

1. שמירת credentials ללקוח (cid / token / paypage_id) — server-only כמו Financy.
2. יצירת חיוב Bino + קריאת iCount ליצירת pay URL.
3. שמירת `icount_payment_url` (+ מזהה עסקה/מסמך) על `collection_charges`.
4. Webhook IPN → סימון `paid` idempotent (רק אם `status != paid`).
5. Feature flag: לקוחות עם `icount_enabled` + דגל פלטפורמה → מסלול iCount; אחרת Grow.
6. חיוב ניסיון אמיתי + IPN — בלי זה אין Go-Live.

### P1 — פורטל / SMS / UX

- `/pay/{token}` מפנה ל־iCount (במקום Grow wallet).
- SMS + פורטל דיירים + resend.
- אופציונלי: `icount_*` על `projects` לחשבון־בניין.

### P2 — הסרת Grow

- אחרי dual-run יציב על כל הלקוחות הפעילים.
- כיבוי כתיבה ל־Grow → soft-deprecate UI → רק אז מחיקת קוד/env (PR נפרד).
- הוראת קבע / refunds / recon UI — לפי צורך רו״ח.

---

## 6) Dual-run / דגלים

| שכבה | התנהגות |
|------|---------|
| `ICOUNT_COLLECTIONS_ENABLED` (env) | כבוי → אין יצירת קישורי iCount (stub/501 לוגיקה עסקית) |
| `clients.icount_enabled` + credentials | לקוח פיילוט |
| Grow | נשאר ברירת מחדל לכל השאר |
| מחיקת קוד Grow | אסורה עד אישור בעלים אחרי P0 ירוק |

---

## 7) סיכוני לו״ז (כנים)

| סיכון | השפעה |
|-------|--------|
| אין סביבת בדיקות מס אצל iCount | חיובים אמיתיים / מסמכי מס בניסיון — תיאום תמיכה iCount |
| כל בניין = cid נפרד | צוואר בקבוק ops (פתיחת חברות, מסופים, בנקים) לפני סקייל |
| כפילות מסמכים | חובה `sanity_string` / idempotency כמו ב־Grow |
| רו״ח לא סוגר doctype | עיכוב Go-Live לא־טכני |
| הסתמכות על Financy בלבד | **לא יעבוד** לגביית דיירים |

הערכה גסה אחרי שיש cid+token+paypage ללקוח פיילוט אחד: **P0 בר־פיילוט ~1–2 שבועות פיתוח ממוקד**; סקייל multi-building + P1 SMS/portal ~עוד 1–2 שבועות; P2 הסרת Grow רק אחרי שבועות dual-run בלי רגרסיה.

---

## 8) Scaffold שכבר בקוד

- מיגרציה: `supabase/migrations/146_icount_collections_scaffold.sql`
- `lib/icount-config.ts`, `lib/icount-credentials.ts`, `lib/icount-client.ts` (stub)
- `POST /api/webhook/icount` — מאשר קבלה, **לא** מסמן שולם
- Settings: שמירת `icount_*` דרך `/api/settings/update` (admin)

השלב הבא לבקשת בעלים: חיבור אמיתי `createPayLink` + mark-paid מ־IPN (עדיין בלי מחיקת Grow).
