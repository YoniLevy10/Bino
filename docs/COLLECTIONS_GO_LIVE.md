# צ׳קליסט Go-Live — גבייה (Grow)

עודכן: 28.09.2026. סימון ✅ רק אחרי בדיקה שמוכיחה שהפריט עובד. סימולציית webhook ≠ תשלום אמיתי.

## A. קוד / אפליקציה

| # | פריט | סטטוס | הערה |
|---|------|--------|------|
| A1 | Webhook דורש סוד — בלי `GROW_WEBHOOK_SECRET` לא מאשרים POST | ✅ | מונע סימון «שולם» מזויף |
| A2 | שליחת חיוב נחסמת אם חסר סוד webhook בשרת | ✅ | לא שולחים קישור בלי מסלול סטטוס |
| A3 | `notifyUrl` נרשם אוטומטית על דרישת התשלום | ✅ | הלקוחה לא מדביקה webhook תשלום ב-Grow |
| A4 | ביטול חיוב מבטל את קישור Bino (`/pay/...`) | ✅ | דייר לא ממשיך לשלם אחרי ביטול |
| A5 | כפתור מנהל «סמן כשולם» (גיבוי כש-webhook נכשל) | ✅ | שחזור תפעולי |
| A6 | דף הצלחה מציג סטטוס אמיתי לפי `?t=` (token) | ✅ | הדייר רואה אישור אמין |
| A7 | מותג Bino בדפי תשלום | ✅ | אמון מותג |
| A8 | בדיקות Vitest לזרימות Grow | ✅ | רגרסיה |
| A9 | Runbook תפעולי קצר | ✅ | `docs/RUNBOOKS.md` |
| A10 | `userId` ייחודי לכל לקוח (אפליקציה + אינדקס DB) | ✅ | מונע שיתוף חשבון |
| A11 | אי אפשר להפעיל גבייה בלי `userId` | ✅ | חשבון לא מוכן ≠ שליחה |
| A12 | מסך גבייה חוסם שליחה עד שחשבון Grow מוגדר | ✅ | UX ברור למנהל |
| A13 | דף `/pay`: מייל (+טלפון) לאישור תשלום ב-Resend | ✅ | קבלה בלי עלות SMS |
| A14 | דפים ציבוריים: `/vaad-pay`, `/terms`, `/contact` + תקנון ב־`/pay` | ✅ | בסיס לאישור סליקה |
| A15 | עמוד Grow **פר-לקוח** `/vaad-pay/{clientId}` + שדות בהגדרות | ✅ | Grow רואה את מי שמקבל את הכסף |
| A16 | פירוק callback form `data[...]` | ✅ | אומת מול updateMyUrl / סימולציה בפרודקשן |
| A17 | GetLink + Webhook הרשמה + UI בהגדרות | ✅ קוד | **חסום להפעלה** עד `GROW_REGISTER_*` ב-Vercel + Webhook אצל Grow |
| A18 | ארנק SDK (`createPaymentProcess` + `/pay` UI) | ✅ קוד | לא אומת ב-UI חי מול תשלום אמת (אין חיוב נוסף) |
| A19 | `invoiceNotifyUrl` + `/api/webhook/grow-invoice` | ✅ קוד | תלוי ש-Grow ישלח חשבונית |
| A20 | כשל Approve + כפתור retry + שמירת `transactionToken` | ✅ קוד | דורש callback אמיתי עם token |
| A21 | קובץ Apple Pay domain association בדומיין | ✅ קובץ חי | רישום בדשבורד Grow/Apple — **לא אומת** |

## B. תשתית / חשבון

| # | פריט | סטטוס | הערה |
|---|------|--------|------|
| B1 | `GROW_API_KEY` + `GROW_X_API_KEY` + `GROW_PAGE_CODE` + `GROW_WEBHOOK_SECRET` ב-Vercel | ✅ sandbox מליאל | |
| B2 | `GROW_ENV=sandbox` לבדיקה | ✅ | לא לייב |
| B3 | תוסף `collections` מופעל | ✅ Bamakor (+ סביון אם רלוונטי) | |
| B4 | Bamakor מחובר ל-userId טסט | ✅ | סביון בלי userId — בידוד אומת |
| B5a | תשלום ביט ₪1 ב-Grow (UI / מייל אישור) | ✅ בוצע ע״י המשתמש | **לא** מאמת את שרשרת Bino |
| B5b | Callback מקורי מ-Grow → סימון «שולם» לחיוב הנכון | ⛔ לא אומת | החיובים ב-DB סומנו בסימולציית webhook (`sim-tx-…` / `audit-tx-form-2`) |
| B5c | ApproveTransaction על עסקת הביט | ⛔ לא אומת | אין `transactionToken` אמיתי ב-DB; `grow_approve_status` ריק |
| B5d | כרטיס אשראי טסט → שולם מקצה לקצה | ⛔ לא הושלם | iframe / ללא חיוב נוסף במשימה זו |
| B6 | Resend לאישור תשלום | ✅ | |
| B7 | פרטי עסק Bamakor בהגדרות | ✅ בסיסי | |
| B8 | מיגרציות 092 / 101 / 102 בפרודקשן Supabase | ✅ | |
| B9 | `GROW_REGISTER_X_API_KEY` / `GROW_MARKETER` / `GROW_PRICE_QUOTE` ב-Vercel | ⛔ חסום | ערכים ב-Postman מליאל; אין הרשאת כתיבה ל-Vercel מהסוכן |
| B10 | Webhook הרשמה מוגדר אצל Grow לכתובת Bino | ⛔ חסום חיצונית | |
| B11 | מפתחות Live | ⛔ לא סופקו | אין מעבר לייצור במשימה זו |

### הפעלה

1. GetLink או הדבקת `userId` בהגדרות → Grow.
2. תשלום ניסיון — **אומת רק כש-B5b+B5c עוברים על callback מקורי**.
3. Bit שולם ב-Grow ≠ סגירת שרשרת Bino.

**Levy Tech על מייל אישור:** שם התצוגה של חשבון הסוחר ב-Grow sandbox שמחובר ל-userId הטסט של Bamakor — לא ערבוב לקוח עם סביון (סביון בלי userId).

## C. פערים שנשארו חיצוניים (לא «v2»)

| # | פריט | למה חסום |
|---|------|----------|
| C1 | אימות שולח ייעודי ל-Webhook הרשמה מעבר ל-`?token=` | לא מתועד אצל Grow |
| C2 | `GROW_WALLET_PAGE_CODE` נפרד אם Live דורש | sandbox עבד עם אותו pageCode; Live לא סופק |
| C3 | רישום דומיין Apple Pay אצל Grow | פעולה בדשבורד שלהם |
| C4 | מזהי Live | לא סופקו; אין cutover |

## פסק דין

**לא מוכן לייצור.** כסף בביט אומת בצד Grow; שיוך+callback+Approve ב-BINO על אותה עסקה — לא אומתו. קוד GetLink/ארנק/חשבונית/retry מוכן למיזוג, אבל תלוי בהגדרות Vercel/Grow חיצוניות.
