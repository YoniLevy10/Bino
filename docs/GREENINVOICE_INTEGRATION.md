# Green Invoice (Morning) — גביית ועד

אינטגרציה עם [Morning / חשבונית ירוקה](https://www.greeninvoice.co.il/api-docs/) לגביית דמי ועד מדיירים.

## ארכיטקטורה

- **חשבון per-tenant** — כל לקוח Bamakor מחבר את חשבון Morning שלו (לא חשבון פלטפורמה).
- **Credentials** — נשמרים ב-`clients` ונכתבים רק דרך `POST /api/settings/update` (admin client).
- **חיובים** — טבלת `collection_charges` (מיגרציה `059`).
- **UI** — לשונית «חשבונית ירוקה» ב-`/settings?tab=greeninvoice`; דף `/collections` (תוסף בתשלום).

## דרישות מהלקוח

1. מנוי **Best+** ב-Morning (גישת API).
2. **מפתח API** — Morning → הגדרות → מתקדם → מפתחות API.
3. **פלאגין סליקה** — Cardcom (E-COMMERCE), Isracard, או Digital Payments (Grow).
4. (מומלץ) **Webhook** — כתובת: `{APP_URL}/api/webhook/greeninvoice`.

## סביבות API

| סביבה | Base URL |
|--------|----------|
| Sandbox | `https://sandbox.d.greeninvoice.co.il/api/v1` |
| Production | `https://api.greeninvoice.co.il/api/v1` |

## אימות

```http
POST /account/token
Content-Type: application/json

{"id": "<API_KEY_ID>", "secret": "<API_SECRET>", "grant_type": "client_credentials"}
```

תשובה: `{"token": "<JWT>", "expires": <unix>}`. JWT בתוקף ~30 דקות.

## קבצים בפרויקט

| קובץ | תפקיד |
|------|--------|
| `lib/greeninvoice-config.ts` | קבועים, סוגי מסמך/מע"מ |
| `lib/greeninvoice-client.ts` | Token, בדיקת חיבור, Payment Form |
| `lib/greeninvoice-credentials.ts` | טעינה מ-`clients` |
| `lib/collection-charges.ts` | סטטוסים וטיפוסים |
| `app/api/settings/test-greeninvoice/route.ts` | בדיקת חיבור מההגדרות |
| `app/api/webhook/greeninvoice/route.ts` | Webhook (MVP — לוג בלבד) |
| `supabase/migrations/059_greeninvoice_collections.sql` | סכמה |

## שדות ב-`clients`

| עמודה | תיאור |
|--------|--------|
| `greeninvoice_enabled` | הפעלת גבייה |
| `greeninvoice_env` | `sandbox` / `production` |
| `greeninvoice_api_key_id` | Key ID |
| `greeninvoice_api_secret` | Secret (לא נטען לדפדפן) |
| `greeninvoice_business_id` | עסק נבחר (מרובי עסקים) |
| `greeninvoice_clearing_plugin` | `cardcom` / `isracard` / `grow` (תיעוד) |
| `greeninvoice_default_doc_type` | 300 / 305 / 320 |
| `greeninvoice_vat_type` | 0 / 1 / 2 |
| `greeninvoice_send_invoice_email` | שליחת מסמך במייל |
| `greeninvoice_remarks_template` | הערות קבועות במסמך |
| `greeninvoice_payment_success_url` | redirect אחרי תשלום |
| `greeninvoice_payment_failure_url` | redirect אחרי כשלון |

## שלבים הבאים (לא מומש עדיין)

1. `POST /api/collections/charges` — יצירת חיוב + `POST /payments/form`.
2. שליחת קישור ב-WhatsApp/SMS לדייר.
3. Webhook → עדכון `collection_charges.status = paid`.
4. סנכרון דייר ↔ לקוח ב-Morning (`POST /clients`).

## תוסף

מפתח: `collections` — קטלוג `paid_addons_catalog` (מיגרציה 059).
