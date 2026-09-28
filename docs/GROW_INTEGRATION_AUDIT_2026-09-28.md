# ביקורת אינטגרציית Grow — BINO

**תאריך:** 28.09.2026  
**ענף / PR:** `cursor/grow-payments-x-api-key-cdb9`  
**מקורות:** קבצים מליאל (SDK / PDF הרשמה / Postman / Apple domain) + תיעוד Grow ב־readme + בדיקות sandbox חיות  
**הערה:** אין גישה לשרשור Gmail «מזהים לטסטים» עצמו — הסתמכות על הקבצים שהועלו לסביבת העבודה.

מסמך זה **לא** כולל מפתחות, `userId`, `apiKey`, `x-api-key` או סודות webhook.

---

## קישורים להעתקה

### BINO / GitHub / Vercel

| מה | קישור |
|----|--------|
| Pull Request #158 | https://github.com/YoniLevy10/Bino/pull/158 |
| אפליקציה (פרודקשן) | https://bamakor.vercel.app |
| גבייה (מסך מנהל) | https://bamakor.vercel.app/collections |
| הגדרות (חיבור Grow ידני) | https://bamakor.vercel.app/settings |
| דף תשלום ציבורי — חיוב ניסיון (ייתכן שכבר שולם) | https://bamakor.vercel.app/pay/2c995bc0-d003-460c-bba2-a6f87b785662 |
| הצלחת תשלום | https://bamakor.vercel.app/pay/success |
| כישלון תשלום | https://bamakor.vercel.app/pay/failure |
| Webhook Grow (נתיב; דורש `?token=`) | https://bamakor.vercel.app/api/webhook/grow |
| עמוד ועד־פיי פלטפורמה | https://bamakor.vercel.app/vaad-pay |
| תקנון | https://bamakor.vercel.app/terms |
| פרטיות | https://bamakor.vercel.app/privacy |
| יצירת קשר | https://bamakor.vercel.app/contact |
| קובץ אימות Apple Pay (production) | https://bamakor.vercel.app/.well-known/apple-developer-merchantid-domain-association |
| Preview של הענף (מוגן Vercel Auth — לא ל־webhook) | https://bino-git-cursor-grow-payments-x-api-4d8cac-yonilevy10s-projects.vercel.app |
| פרויקט Vercel | https://vercel.com/yonilevy10s-projects/bino |

### תיעוד Grow (רשמי)

| מה | קישור |
|----|--------|
| Overview / CreatePaymentProcess | https://grow-il.readme.io/reference/overview-6 |
| Payment Link | https://grow-il.readme.io/reference/payment-link |
| Server-to-Server Callback | https://grow-il.readme.io/reference/server-response |
| Approve Transaction | https://grow-il.readme.io/reference/approve-transation |
| כלי בדיקת callback (`updateMyUrl`) | https://sandbox.meshulam.co.il/api/light/server/1.0/updateMyUrl/?url=YOUR_HTTPS_URL |
| Sandbox API base | https://sandbox.meshulam.co.il/api/light/server/1.0 |
| Production API base | https://secure.meshulam.co.il/api/light/server/1.0 |
| GetLink (רישום — test) | https://devregisterapi.meshulam.co.il/GetLink |
| SDK script (ארנק) | https://cdn.meshulam.co.il/sdk/gs.min.js |
| Apple Pay SDK (ממייל) | https://meshulam.co.il/_media/js/apple_pay_sdk/sdk.min.js |

### מסמכי BINO בריפו

| מה | נתיב / קישור גולמי אחרי מיזוג ל־main |
|----|--------|
| מודל גבייה | `docs/PAYMENTS.md` → https://github.com/YoniLevy10/Bino/blob/main/docs/PAYMENTS.md |
| צ׳קליסט Go-Live | `docs/COLLECTIONS_GO_LIVE.md` → https://github.com/YoniLevy10/Bino/blob/main/docs/COLLECTIONS_GO_LIVE.md |
| Runbook גבייה | `docs/RUNBOOKS.md` → https://github.com/YoniLevy10/Bino/blob/main/docs/RUNBOOKS.md |
| מסמך ביקורת זה | `docs/GROW_INTEGRATION_AUDIT_2026-09-28.md` → https://github.com/YoniLevy10/Bino/blob/cursor/grow-payments-x-api-key-cdb9/docs/GROW_INTEGRATION_AUDIT_2026-09-28.md |

### קבצים מקור מליאל (בסביבת הענן; לא בריפו)

| קובץ | תיאור |
|------|--------|
| `SDK_Implementation_*.docx` | הטמעת ארנק SDK |
| `*bd73.pdf` | דוקומנטציה הרשמה / GetLink |
| `*GROW.postman_collection*.json` | Postman GetLink |
| `production_domain_verification_*.txt` | אימות Apple — production |
| `development_domain_verification_*.txt` | אימות Apple — development |

---

## 1) מיפוי מימוש נוכחי

| מסלול | סטטוס | מיקום בקוד |
|--------|--------|------------|
| הצטרפות עסק (GetLink) | **חסר** | אין קוד; אזכור עתידי ב־`docs/COLLECTIONS_GO_LIVE.md` (C2) |
| שמירת `encrypted_lead` / tracking | **חסר** | — |
| Webhook הרשמה (שמירת `user_id` אחרי אישור) | **חסר** | — |
| יצירת דרישת תשלום (CreatePaymentLink) | **ממומש** | `lib/grow-client.ts` → `createGrowPaymentLink` · נקרא מ־`lib/collection-charge-ops.ts` → `sendCollectionCharge` |
| ארנק SDK / createPaymentProcess | **חסר** | אין `gs.min.js` / `configureGrowSdk` / `renderPaymentOptions` |
| פתיחת ארנק בדפדפן | **חסר** | — |
| Webhook תשלום + ApproveTransaction | **ממומש (+תוקן)** | `app/api/webhook/grow/route.ts` · `lib/grow-webhook.ts` · `lib/grow-client.ts` → `approveGrowTransaction` |
| שיוך `userId` ידני | **ממומש** | `app/settings/page.tsx` + `app/api/settings/update/route.ts` |
| בידוד `userId` בין לקוחות | **ממומש** | `lib/grow-credentials.ts` → `findOtherClientUsingGrowUserId` + אינדקס ב־`supabase/migrations/092_grow_payments.sql` |
| Apple Pay domain file | **ממומש** | `public/.well-known/apple-developer-merchantid-domain-association` |

**מודל מוצר (מתועד):** v1 = CreatePaymentLink בלבד, לא ארנק iframe — ראו `docs/PAYMENTS.md`.

---

## 2) בידוד לקוחות

| בדיקה | ממצא |
|--------|------|
| `userId` פר־לקוח | נשלח מ־`clients.grow_user_id` של ה־`clientId` המאומת בלבד |
| מניעת שיתוף userId | בדיקת אפליקציה + אינדקס ייחודי + HTTP 409 בהגדרות |
| מזהי פלטפורמה | `GROW_API_KEY`, `GROW_X_API_KEY`, `GROW_PAGE_CODE`, `GROW_WEBHOOK_SECRET` ב־Vercel (שרת בלבד) |
| מזהי עסק | `grow_user_id` (+ פרטי משפטיים `grow_legal_*`) בטבלת `clients` |
| סביבת טסט | `GROW_ENV=sandbox` — לא לייב |
| סביון | ללא `grow_enabled` / ללא userId — לא יכולה לחייב |
| Bamakor | מחובר ל־userId טסט (sandbox בלבד) |

**סיכון שיורי:** `pageCode` אחד ברמת פלטפורמה (לא per-tenant) — תואם מודל Grow כפלטפורמה, כל עוד לכל ועד יש `userId` נפרד.

---

## 3) הצטרפות עסק (GetLink)

**לא ממומש ב־BINO.**

ממסמכי PDF + Postman + בדיקת API חיה:

| שדה / תנאי | תוצאה |
|-------------|--------|
| `price_quote` | מתקבל (חזרה עסקית ידועה — עסק קיים) |
| `quote_price` | נדחה (שגיאה כללית) — **לא** להשתמש |
| `is_send_sms` | אותו שם ב־PDF וב־Postman |
| חובה `User-Agent` | בלי Header — שגיאה כללית |
| `encrypted_lead` | חובה לשמור ולקשר ללקוח BINO (לפי PDF) |
| Webhook הרשמה | מחזיר `user_id` וכו' — **חסר מנגנון אימות שולח בתיעוד** |

---

## 4) ארנק תשלום (SDK)

**חסר לחלוטין בקוד.**

לפי SDK Implementation:

1. טעינת `https://cdn.meshulam.co.il/sdk/gs.min.js`
2. `configureGrowSdk` → `growPayment.init({ environment, version, events })`
3. שרת: `createPaymentProcess` עם `pageCode` במצב SDK wallet
4. לקוח: `growPayment.renderPaymentOptions(authCode)`
5. אירועים: `onSuccess` / `onFailure` / `onError` / `onTimeout` / `onWalletChange`
6. **אין** לסמן חוב כשולם רק מ־`onSuccess` בדפדפן — רק אחרי S2S + Approve

---

## 5) קישור לתשלום (CreatePaymentLink)

| דרישה | סטטוס |
|--------|--------|
| Header `x-api-key` נפרד מ־body `apiKey` | ממומש (`GROW_X_API_KEY`) |
| שדה חובה `sum` | ממומש; בלי → שגיאת סכום (אומת) |
| סכום מרשומת חיוב בשרת | `sendCollectionCharge` משתמש ב־`charge.amount` |
| שיוך לדייר/חוב | `cField1` = `public_token`; נשמר `grow_payment_link_id` |
| זיהוי אחרי סגירת דפדפן | תלוי Webhook S2S (לא הצלחת UI) |

---

## 6) Callback + ApproveTransaction

**פער קריטי שתוקן (28.09):**  
Grow שולח `Content-Type: application/x-www-form-urlencoded` עם מפתחות כמו `data[customFields][cField1]` (אומת ב־`updateMyUrl` → httpbin). הקוד הישן חיפש JSON מקונן ודילג על תשלומים.

אחרי התיקון:

| תרחיש | תוצאה חיה |
|--------|-----------|
| form + `statusCode=2` | `matched:1` → חיוב `paid` |
| Callback כפול | `matched:0` (ללא כפל) |
| בלי `statusCode` (צורת סימולטור) | `ignored:true` |
| token שגוי | HTTP 401 |
| Approve נכשל | החיוב נשאר `paid`; Grow יכול לרשום שוב |

**שיורי:** אין UI ל־«Approve נכשל»; PayBox / העברה בנקאית — ב־UI של Grow, ללא לוגיקה ייעודית אצלנו מעבר ל־`transactionTypeId`.

---

## 7) סודות וסביבות

| בדיקה | ממצא |
|--------|------|
| מפתחות ב־Git | לא נמצאו |
| חשיפה בדפדפן (`NEXT_PUBLIC_GROW_*`) | אין |
| משתני Vercel | `GROW_API_KEY`, `GROW_X_API_KEY`, `GROW_PAGE_CODE`, `GROW_WEBHOOK_SECRET`, `GROW_ENV` |
| הפרדת sandbox | `GROW_ENV=sandbox` |
| קובץ Apple production | תואם את הקובץ מהמייל; חי בדומיין |
| רישום דומיין בדשבורד Grow/Apple | **לא אומת** |

כרטיסי טסט (ממייל ליאל — לא סודות API):

1. `4580458045804580` — תשלום בודד / גם לכישלון בתשלומים מרובים  
2. `4580000000000000`  
3. `4580111111111121`  

העברה בנקאית (טסט): בנק 41 · סניף 410 · חשבון 411111111  

**אזהרה מליאל:** Bit / Apple Pay / Google Pay עלולים להיות חיוב אמת — לבדוק בסכומים נמוכים בלבד.

---

## 8) טבלת פערים לפי חומרה

| חומרה | פער | טיפול |
|--------|-----|--------|
| **קריטי** | Callback form `data[...]` לא פוענח | **תוקן** — `expandBracketFormKeys` + דיפלוי |
| **גבוה** | בלבול `apiKey` / `x-api-key`; חסר `sum` | **תוקן** |
| **גבוה** | GetLink + Webhook הרשמה | **חסר** — לא מומש |
| **גבוה** | ארנק SDK | **חסר** — מחוץ ל־v1 |
| **בינוני** | אין אימות שולח ל־Webhook הרשמה | חסם מול Grow |
| **בינוני** | אין מצב/UI לכשל Approve | לוג בלבד; retry מ־Grow |
| **נמוך** | `quote_price` vs `price_quote` | אומת: רק `price_quote` |
| **נמוך** | כרטיס אשראי ב־iframe — אוטומציה נכשלה | תשלום ידני |

---

## 9) שאלות ל־Grow

1. מה מנגנון אימות השולח ל־Webhook **ההרשמה** (חתימה / IP / סוד)?  
2. האם `pageCode` של דרישת תשלום ושל ארנק SDK הם מזהים נפרדים — ומה ה־pageCode לארנק ל־v2?  
3. האם ב־callback אמיתי תמיד מגיע `data[statusCode]=2`, או שיש מצבים עם `status=שולם` בלבד? (סימולטור `updateMyUrl` לא שולח `statusCode`)  
4. מתי מגיעים מזהי **Live** (marketer / price_quote / apiKey / x-api-key / pageCode)?  
5. האם הדומיין של האפליקציה כבר רשום אצלם ל־Apple Pay?

---

## 10) פסק דין לפי מסלול

| מסלול | פסק דין | סיבה |
|--------|----------|------|
| GetLink / הצטרפות | **חסום** | אין מימוש; חסר אימות Webhook הרשמה בתיעוד |
| ארנק SDK | **חסום** | לא ממומש; v1 לא דורש |
| CreatePaymentLink | **מוכן לטסט** | אומת ב־sandbox; לא מוכן לייצור |
| S2S Callback + Approve | **מוכן לטסט** | form parsing אומת בפרודקשן אחרי התיקון |
| ייצור (כסף אמיתי) | **חסום** | sandbox בלבד; אין מפתחות Live; לכל לקוח צריך userId משלו |

---

## 11) צעדים מיידיים (העתקה)

1. למזג את ה־PR:  
   https://github.com/YoniLevy10/Bino/pull/158  
2. לשלם חיוב ניסיון בכרטיס טסט (אם עדיין פתוח / ליצור חדש מ־`/collections`):  
   https://bamakor.vercel.app/collections  
3. לוודא סטטוס «שולם» אחרי תשלום אמיתי ב־sandbox (לא רק סימולציית webhook).  
4. לפני לקוחות אמיתיים: מפתחות Live מליאל + `GROW_ENV=production` (או הסרה) + `userId` פר־לקוח.  
5. לשלוח ל־Grow את 5 השאלות בסעיף 9.

---

## 12) קבצי קוד מרכזיים (נתיבים)

```
lib/grow-config.ts
lib/grow-client.ts
lib/grow-credentials.ts
lib/grow-webhook.ts
lib/collection-charge-ops.ts
app/api/webhook/grow/route.ts
app/api/settings/update/route.ts
app/api/collections/account-status/route.ts
app/collections/CollectionsBoard.tsx
app/settings/page.tsx
app/pay/[token]/page.tsx
app/api/public/pay/[token]/route.ts
public/.well-known/apple-developer-merchantid-domain-association
supabase/migrations/090_client_grow_legal.sql
supabase/migrations/092_grow_payments.sql
docs/PAYMENTS.md
docs/COLLECTIONS_GO_LIVE.md
docs/RUNBOOKS.md
```

---

*סוף מסמך הביקורת — 28.09.2026*
