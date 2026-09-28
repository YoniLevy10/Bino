# ביקורת אינטגרציית Grow — BINO

**תאריך:** 28.09.2026 (עדכון סוף-יום אחרי סגירת פערים בקוד)  
**ענף / PR:** `cursor/grow-payments-x-api-key-cdb9` · https://github.com/YoniLevy10/Bino/pull/158  
**הערה:** אין גישה לשרשור Gmail; הסתמכות על קבצים שהועלו + DB Bamakor + בדיקות sandbox קודמות.

מסמך זה **לא** כולל מפתחות, `userId`, `apiKey`, `x-api-key` או סודות webhook.

---

## קישורים להעתקה

| מה | קישור |
|----|--------|
| PR #158 | https://github.com/YoniLevy10/Bino/pull/158 |
| אפליקציה | https://bino.casa |
| גבייה | https://bino.casa/collections |
| הגדרות Grow | https://bino.casa/settings?tab=grow |
| Webhook תשלום | https://bino.casa/api/webhook/grow |
| Webhook הרשמה | https://bino.casa/api/webhook/grow-register |
| Webhook חשבונית | https://bino.casa/api/webhook/grow-invoice |
| Apple Pay file | https://bino.casa/.well-known/apple-developer-merchantid-domain-association |
| SDK | https://cdn.meshulam.co.il/sdk/gs.min.js |
| GetLink test | https://devregisterapi.meshulam.co.il/GetLink |

---

## 1) מיפוי מימוש (אחרי התיקונים)

| מסלול | סטטוס קוד | אימות חי |
|--------|-----------|----------|
| GetLink + שמירת `encrypted_lead` | ממומש | חסום: חסרים `GROW_REGISTER_*` ב-Vercel |
| Webhook הרשמה → `userId` | ממומש | חסום: Grow חייב להצביע ל-URL של Bino |
| CreatePaymentLink | ממומש | sandbox אומת קודם |
| ארנק SDK | ממומש (`/pay` + `/wallet`) | לא אומת בתשלום אמת (אין חיוב נוסף) |
| S2S + Approve + retry | ממומש | form parsing אומת בסימולציה; עסקת ביט אמיתית — לא |
| בידוד userId | ממומש | Bamakor עם userId; סביון בלי |
| invoiceNotifyUrl | ממומש | תלוי Grow |
| Apple domain file | ממומש + תואם קובץ ליאל | רישום בדשבורד — לא אומת |

---

## 2) עסקת ביט ₪1 + Levy Tech

| שלב | תוצאה |
|-----|--------|
| תשלום בביט ב-Grow | ✅ בוצע ע״י המשתמש (מייל אישור) |
| שם «Levy Tech» על המייל | חשבון הסוחר ב-Grow sandbox של ה-userId הטסט המשויך ל-Bamakor — **לא** באג שיוך ל-סביון |
| Callback מקורי ל-BINO על אותה עסקה | ⛔ לא נמצא — ב-DB `grow_transaction_id` סימולטיבי (`audit-tx-form-2` / `sim-tx-…`), `grow_approve_status` ריק |
| סימון שולם פעם אחת + Approve | ⛔ לא אומת על הביט האמיתי |

---

## 3) פערים מקוריים → טיפול

| פער | טיפול |
|-----|--------|
| Callback form `data[...]` | תוקן + נבדק בסימולציה |
| apiKey / x-api-key / sum | תוקן |
| GetLink + tracking + webhook | קוד מלא; הפעלה חסומה ב-Vercel/Grow |
| ארנק SDK | קוד מלא; בלי חיוב אמת נוסף |
| כפילויות / כשל Approve | idempotent mark-paid + persist token + retry UI |
| בידוד ועדים | נשמר + נבדק ב-DB |
| חשבוניות | invoiceNotify + webhook |
| Apple Pay | קובץ בדומיין; רישום חיצוני |
| סימון שגוי B5 ✅ אחרי ביט בלבד | תוקן ב-`COLLECTIONS_GO_LIVE.md` (B5a/b/c/d) |

---

## 4) חסימות חיצוניות (מדויק)

1. **`GROW_REGISTER_X_API_KEY` / `GROW_MARKETER` / `GROW_PRICE_QUOTE`** — ערכי sandbox ב-Postman מליאל; הסוכן לא מצליח לכתוב ל-Vercel (403). בלי זה GetLink מחזיר 503.
2. **הגדרת Webhook הרשמה אצל Grow** ל־`…/api/webhook/grow-register?token=…`.
3. **`transactionToken` אמיתי** מעסקת הביט — בלי זה אי אפשר לאשר Approve על אותה עסקה; אין לבצע חיוב נוסף במשימה.
4. **מפתחות Live + רישום Apple בדשבורד** — לא סופקו / לא אומתו.
5. **אימות שולח ייעודי ל-Webhook הרשמה** מעבר ל-`?token=` — לא מתועד אצל Grow.

---

## 5) פסק דין

**לא מוכן לייצור.** הקוד סוגר את הפערים הניתנים לסוכן; זרימות הכסף וה-callback המקורי על הביט לא אומתו מקצה לקצה ב-BINO.

---

*סוף עדכון — 28.09.2026*
