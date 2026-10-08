# Grow Live Cutover — checklist (2026-10)

מזהי לייב מגיעים ממייל Grow. **אין להדביק סודות לקבצי git** — רק ל-Vercel Environment Variables (Production).

## 1. כתובות Webhook (חובה לתקן מול Grow)

Grow הגדירו דרישת תשלום על `bamakor.vercel.app`. הכתובת הקנונית:

| סוג | URL |
|-----|-----|
| תשלום (notify) | `https://bino.casa/api/webhook/grow?token=<GROW_WEBHOOK_SECRET>` |
| הרשמה (GetLink) | `https://bino.casa/api/webhook/grow-register?token=<register token>` |
| חשבונית | `https://bino.casa/api/webhook/grow-invoice?token=<GROW_WEBHOOK_SECRET>` |

`bamakor.vercel.app` עדיין מגיש webhooks (passthrough), אבל יש לעדכן אצל Grow ל־`bino.casa`.

אם Grow שלחו **שני טוקנים שונים** (תשלום ≠ הרשמה): אפשר לשים ב־`GROW_WEBHOOK_SECRET` רשימה מופרדת בפסיקים, או `GROW_REGISTER_WEBHOOK_SECRET` נפרד להרשמה.

## 2. משתני Vercel (Production)

| משתנה | מקור ממייל Grow |
|--------|------------------|
| `GROW_ENV` | `production` (או מחק — ברירת מחדל production) |
| `GROW_API_KEY` | body `apiKey` לדרישת תשלום |
| `GROW_X_API_KEY` | אם ניתן בנפרד לתשלומים; אחרת השאר ריק (fallback ל־`GROW_API_KEY`) |
| `GROW_PAGE_CODE` | pageCode דרישת תשלום |
| `GROW_WALLET_PAGE_CODE` | אופציונלי; אם אין — נופל ל־`GROW_PAGE_CODE` |
| `GROW_WEBHOOK_SECRET` | הטוקן(ים) מ־`?token=` ב-URLs |
| `GROW_REGISTER_WEBHOOK_SECRET` | אופציונלי אם טוקן ההרשמה שונה |
| `GROW_REGISTER_X_API_KEY` | header `x-api-key` ל־GetLink |
| `GROW_MARKETER` | body `marketer` |
| `GROW_PRICE_QUOTE` | אחד מהמסלולים למטה |
| `GROW_REGISTER_IS_DIRECT_DEBIT` | `0` בלייב |
| `GROW_REGISTER_BASE_URL` | אופציונלי; ברירת מחדל לייב `https://registerapi.meshulam.co.il` |
| `NEXT_PUBLIC_APP_URL` | `https://bino.casa` |

### מסלולי `price_quote` (לייב)

| חבילה | ערך |
|--------|-----|
| 0.75% + ₪69/חודש | `KKlp53` |
| 0.75% + ₪59/חודש (שנתי Grow) | `HJJL57k` |
| 1% + ₪29/חודש (תשלום מראש שנתי) | `RFGG57` |

תנאי מסלול: https://grow.business/fees/

## 3. Hosts בקוד (אחרי merge)

| קריאה | Host לייב |
|--------|-----------|
| CreatePaymentLink | `https://api.grow.link/api/light/server/1.0/CreatePaymentLink` |
| createPaymentProcess | `https://secure.meshulam.co.il/api/light/server/1.0/createPaymentProcess` |
| approveTransaction | `https://secure.meshulam.co.il/api/light/server/1.0/approveTransaction` |
| GetLink | `https://registerapi.meshulam.co.il/GetLink` |

## 4. אחרי עדכון env

1. Redeploy Production (env נטען בזמן ריצה לרוב השרת; `NEXT_PUBLIC_*` דורש rebuild).
2. לוודא ללקוח טסט יש `grow_user_id` לייב (לא sandbox).
3. חיוב ₪1 חדש → תשלום → `paid` + `grow_approve_status=ok`.
4. לקוח קיים ב-Grow: לפנות ל־support@grow.business / 052-7773144 להתחברות לפלטפורמת BINO (ה־userId מגיע ב-webhook הרשמה).

## 5. טיוטה ל-Grow — תיקון webhook תשלום

> שלום,  
> תודה על מזהי הלייב.  
> נא לעדכן את כתובת עדכון השרת לעסקאות ל:  
> `https://bino.casa/api/webhook/grow?token=<אותו טוקן שסוכם>`  
> (במקום bamakor.vercel.app)  
> כתובת ההרשמה ב־bino.casa תקינה מצדנו.
