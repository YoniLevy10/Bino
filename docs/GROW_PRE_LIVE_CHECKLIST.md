# Grow — שלב מקדים לעלייה ללייב (יעד: יום שני)

מקור: מייל/הודעה מ־Grow עם 6 סעיפים חובה. עודכן: 2026-10-01.

| # | דרישת Grow | סטטוס BINO | מה נשאר אצלכם |
|---|------------|------------|----------------|
| 1 | ApproveTransaction + `transactionId` לדוגמה | ✅ אומת בפרודקשן | לשלוח במידל: `552938` |
| 2 | תקנון + צ׳קבוקס + Site_check + כתובת אתר | ✅ מוכן לבדיקה | לשלוח URL ל־Grow |
| 3 | סרטון תהליך תשלום מקצה לקצה | ⛔ חסר | לצלם ולהעלות/לשלוח |
| 4 | GetLink עד אימות ת״ז + webhook הרשמה | ⚠️ קוד מוכן; הזנקה חיה חסרה | להזניק GetLink + לשלוח webhook |
| 5 | שם המערכת כפי שמשווקת | ✅ | **BINO** |
| 6 | טופס הצטרפות אחרי הכל | ממתין ל־Grow | אחרי 1–5 |

---

## 1. ApproveTransaction — מוכן

- חיוב Bamakor `99ba763c-c321-4569-904e-d621dad82245` (₪1, 2026-09-30)
- `grow_transaction_id` = **`552938`**
- `grow_transaction_token` קיים
- `grow_approve_status` = **`ok`**, `grow_approve_at` נשמר
- הקוד ב־`/api/webhook/grow` קורא ל־`approveGrowTransaction` לפני/עם סימון שולם (ראו `app/api/webhook/grow/route.ts`)

**לשלוח ל־Grow:** transactionId לדוגמה = `552938`  
קישור דוקס: https://grow-il.readme.io/reference/approve-transation

---

## 2. תקנון / צ׳קבוקס / אתר — מוכן לבדיקה שלהם

| דרישת Site_check (מדוקס Live) | איפה ב־BINO |
|-------------------------------|-------------|
| אתר פעיל + דומיין | `https://bino.casa` |
| עמוד תשלום | `https://bino.casa/pay/{token}` (קישור חיוב) |
| טלפון יצירת קשר | `/contact` (מוצג בלייב) |
| כתובת עסק | `/contact` + `/vaad-pay/{clientId}` |
| צ׳קבוקס תקנון לפני תשלום + קישור | `/pay` — חובה לסמן; קישור ל־`/terms` |
| תקנון באתר עם: אספקה, אחריות, גיל 18+, ביטול, פרטיות | `https://bino.casa/terms` (+ `/privacy`) |
| קישור תקנון/פרטיות מדף הבית | כן בפוטר השיווקי |

**כתובות לשלוח לבדיקה (עד יום עסקים):**
- אתר ראשי: `https://bino.casa`
- תקנון: `https://bino.casa/terms`
- פרטיות: `https://bino.casa/privacy`
- יצירת קשר: `https://bino.casa/contact`
- עמוד עסק לדוגמה (Bamakor): `https://bino.casa/vaad-pay/7573f5ad-70e5-4357-8fef-1d96ec38d169`

Site_check: https://grow.business/Site_check

---

## 3. סרטון — חובה עליכם

לצלם מסך (מובייל או דסקטופ) מההתחלה עד הסוף:

1. פתיחת קישור `/pay/...` של חיוב ₪1 פתוח  
2. סימון תקנון + הזנת מייל (אם רלוונטי)  
3. מעבר לתשלום Grow  
4. השלמת תשלום (כרטיס טסט / ביט בסכום נמוך)  
5. חזרה / הצלחה + סטטוס «שולם» בגבייה (אופציונלי אבל מומלץ)

לא לסמן סעיף זה כבוצע לפני שיש קובץ וידאו מוכן לשליחה.

---

## 4. הצטרפות לקוח חדש (GetLink) — חסר הזנקה חיה

**בקוד (מוכן):**
- API: `POST/GET /api/collections/grow-onboard`
- UI: הגדרות → Grow → GetLink
- Webhook: `GET/POST /api/webhook/grow-register` (חי בלייב — GET מחזיר `{"ok":true,"route":"grow-register"}`)
- כתובת webhook (עם `?token=` מ־`GROW_WEBHOOK_SECRET`): מוצגת ב־GET `/api/collections/grow-onboard` כש־`register_ready=true`

**מה לבצע לפני יום שני:**
1. לוודא ב־Vercel: `GROW_REGISTER_X_API_KEY`, `GROW_MARKETER`, `GROW_PRICE_QUOTE`, `GROW_REGISTER_IS_DIRECT_DEBIT`, `GROW_WEBHOOK_SECRET`, `NEXT_PUBLIC_APP_URL`
2. ליצור לקוח טסט חדש (לא Bamakor שכבר מחובר ב־userId) / או לקוח בלי `grow_user_id`
3. הגדרות → Grow → הזנקת GetLink עם עוסק/ת״ז + נייד
4. להגיע במסך Grow **עד שלב אימות תעודת זהות** — ולעצור שם לפי הוראתם
5. לשלוח ל־Grow במייל חוזר:
   - כתובת מייל ליצירת קשר (למשל `levyyoni5@gmail.com`)
   - **כתובת ה־webhook להרשמה** (מהגדרות / מתשובת `grow-onboard` — כולל `token`)

בלי שלב 4–5 סעיף זה לא סגור מול Grow.

---

## 5. שם המערכת

**BINO** (Building Intelligence & Operations) — כפי שמשווק באתר ובממשק.

---

## 6. טופס הצטרפות

אחרי ש־Grow מאשרים את 1–5 — הם ישלחו טופס חתימה. לא לחתום לפני שהסרטון + GetLink הושלמו.

---

## טיוטת מענה ל־Grow (להעתיק אחרי ש־3 ו־4 בוצעו)

```
שלום,

מאשרים את סעיפי הבדיקה המקדימה לעלייה ללייב:

1. ApproveTransaction — בוצע ומאומת במערכת.
   transactionId לדוגמה לעסקה מוצלחת: 553499

2. תקנון + צ'קבוקס אישור תקנון לפני תשלום — קיימים.
   כתובת האתר לבדיקה: https://bino.casa
   תקנון: https://bino.casa/terms
   פרטיות: https://bino.casa/privacy
   יצירת קשר: https://bino.casa/contact
   עמוד עסק ממותג ללקוח (שם + פרטי קשר + לוגו):
   https://bino.casa/vaad-pay/7573f5ad-70e5-4357-8fef-1d96ec38d169
   עמוד תשלום לדייר (/pay) מציג את שם הלקוח והלוגו של אותו לקוח לפי ה-userId / החיוב.

3. מצורף סרטון וידאו של תהליך התשלום מקצה לקצה.

4. תהליך הצטרפות GetLink הוזנק והגענו לשלב אימות תעודת זהות.
   מייל לחיווי: levyyoni5@gmail.com
   Webhook להקמת לקוח: [להדביק מ־הגדרות → Grow / grow-onboard → register_webhook_url]

5. שם המערכת כפי שמשווקת ללקוחות: BINO

נשמח להמשך תהליך החתימה על טופס ההצטרפות.

תודה,
יוני
```

---

## סדר עבודה מומלץ עד יום שני

1. **היום:** לאשר ש־`GROW_REGISTER_*` ב־Vercel; להזניק GetLink עד אימות ת״ז; להעתיק `register_webhook_url`
2. **היום/מחר:** לצלם סרטון תשלום ₪1 מלא
3. **לשלוח ל־Grow** את הטיוטה למעלה + סרטון + webhook (לא לחכות ליום שני בבוקר)
4. במקביל: הגדרות מסמכים באתר העסקי טסטים (חשבונית) — נפרד מרשימת ה־6, אבל רצוי לפני לייב מוצר
