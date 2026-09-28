# מודל הגבייה — מה קורה פה

מטרה אחת: **לקוחות הפלטפורמה (חברות ניהול) גובים כסף מהדיירים שלהם.**

Bino לא סולקת ולא מחזיקה כסף. אין «חשבון תשלומים של Bino».

```
דייר → /pay של Bino → קישור תשלום Grow ו/או ארנק SDK → כסף לחשבון Grow של הלקוח
Bino: יוצרת חיוב, שולחת SMS, מקבלת S2S, מסמנת «שולם», ApproveTransaction, מייל אישור, חשבונית (אם Grow שולח)
```

## למה Grow ישירות (לא Morning)

Grow מחברים את Bino כפלטפורמה:

- `apiKey` + `x-api-key` + `pageCode` — Bino (Vercel)
- `userId` — לכל לקוח, אחרי הצטרפות Grow (GetLink או הדבקה ידנית)
- דמי מנוי חודשיים על Bino כמערכת; עמלות עסקה על חשבון Grow של הלקוח
- הכסף לא עובר דרך יזם הפלטפורמה

שדות קריטיים ב־`createPaymentLink`: `sum` (סכום כולל — בלי זה Grow מחזיר 707), גוף `apiKey` + header `x-api-key`, `userId` של הלקוח, `pageCode` דרישת תשלום, ו־`notifyUrl` עם `GROW_WEBHOOK_SECRET`.

ארנק SDK: `createPaymentProcess` + `gs.min.js` → `renderPaymentOptions(authCode)`. **אין** לסמן «שולם» מ־`onSuccess` בדפדפן — רק אחרי S2S + Approve.

## מי ממלא מה

| | יזם הפלטפורמה | הלקוח (למשל שרה) |
|---|---|---|
| בונה את המערכת / מביא לקוחות | כן | — |
| כסף מדיירים | **לא, בשום צורה** | חשבון Grow שלה |
| מפתחות API | `GROW_API_KEY`, `GROW_X_API_KEY`, `GROW_PAGE_CODE`, `GROW_WEBHOOK_SECRET` (+ GetLink: `GROW_REGISTER_*`) | `userId` (אוטומטי מ-Webhook הרשמה / הדבקה) |
| עמוד עסק ציבורי | `/vaad-pay` של הפלטפורמה | `/vaad-pay/{clientId}` עם **השם/טלפון/כתובת שלה** |

## הפעלה (פיילוט)

1. להריץ מיגרציות `092` + `101` + `102` (Grow payments / onboarding / transaction token).
2. ב-Vercel: מפתחות תשלום + (ל-GetLink) `GROW_REGISTER_X_API_KEY`, `GROW_MARKETER`, `GROW_PRICE_QUOTE`, `GROW_REGISTER_IS_DIRECT_DEBIT=1` ב-sandbox.
3. ב-Grow: להגדיר Webhook הרשמה ל־`/api/webhook/grow-register?token=…` (אותו `GROW_WEBHOOK_SECRET`).
4. סופר-אדמין: תוסף גבייה ללקוחה.
5. הגדרות → Grow: GetLink או הדבקת `userId` + פרטי עסק.
6. חיוב ניסיון → callback אמיתי → «שולם» + Approve + מייל קבלה.

בלי שלב 6 עם **callback אמיתי** (לא סימולציה) — לא מוכרים גבייה ללקוחה.

## סביבת בדיקה (sandbox)

- `GROW_ENV=sandbox` + מפתחות בדיקה מליאל.
- **אזהרה:** Bit / Apple Pay / Google Pay עלולים להיות חיוב אמת גם ב-sandbox — לבדוק בסכומים נמוכים בלבד.
- לייב: `GROW_ENV=production` (או השמטה) + מפתחות Live + `userId` אמיתי לכל לקוח.

## Webhooks

| נתיב | תפקיד |
|------|--------|
| `/api/webhook/grow?token=` | תשלום S2S — סימון שולם + ApproveTransaction |
| `/api/webhook/grow-register?token=` | סיום GetLink — שמירת `userId` לפי `tracking_code` |
| `/api/webhook/grow-invoice?token=` | חשבונית מ-Grow (`invoiceNotifyUrl`) |

Grow שולח לרוב `application/x-www-form-urlencoded` עם מפתחות `data[...]` — Bino מפרקת עם `expandBracketFormKeys`.

כפילויות: עדכון ל־`paid` רק כש־`status != paid`. כשל Approve: החיוב נשאר שולם; נשמר `grow_approve_status=failed` + כפתור «נסה לאשר שוב» (דורש `grow_transaction_token` מה-callback המקורי).

## Apple Pay

קובץ אימות דומיין: `public/.well-known/apple-developer-merchantid-domain-association` (תואם קובץ production מליאל; חי ב־`bino.casa`, וגם ב־alias `bamakor.vercel.app`). רישום הדומיין החדש בדשבורד Grow/Apple — פעולה חיצונית אצלם. ראו גם `docs/DOMAIN.md`.
