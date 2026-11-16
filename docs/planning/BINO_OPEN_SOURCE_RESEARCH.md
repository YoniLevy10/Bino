# BINO 2.0 — מחקר Open Source + מיחזור מריפוז פנימיים

**תאריך:** 16.11.2026  
**מטרה:** להקל על כתיבת קוד — Integrate / Build / Learn / Reject.  
**כלל רישוי:** לא להטמיע AGPL במונולית BINO בלי רישיון מסחרי. MIT / Apache-2.0 מועדפים.

---

## 1. ריפוז שלנו ב־GitHub (מיחזור קודם)

| ריפו | קישור | מה רלוונטי ל־2.0 | המלצה |
|------|--------|-------------------|--------|
| **OPC** | https://github.com/YoniLevy10/OPC | דוחות PDF/Excel RTL (`export-formats.tsx`), `formatIls` / true-cost, דירוג אנשי מקצוע, ארון מסמכים לפי scope | **Integrate patterns** — להעתיק תבניות/לוגיקה ל־BINO (לא memory-store) |
| **Bino** | https://github.com/YoniLevy10/Bino | Grow, `unit_ledger`, collections, `excel-workbook`, project documents | **Extend** — מקור האמת |
| **Moked** | https://github.com/YoniLevy10/Moked | Tenant isolation tests, PSP/webhook discipline | **Learn / copy tests patterns** |
| **Fixly** | https://github.com/YoniLevy10/Fixly | Grow webhook stub, feature flags תשלומים, idempotent webhooks | **Learn** |
| Bamakor_site / levy_tech_site | שיווק | לא ליבת Finance | Reject לעניין זה |

**מסלול מקומי מומלץ לפורט מדוחות OPC:**  
`/Users/levyyoni/Developer/optical-center/src/modules/reports/` + `spend/true-cost.ts` + `documents/store-document-access.ts`.

---

## 2. בנקאות / סנכרון תנועות

| פרויקט | רישיון | עדכניות | התאמה | המלצה |
|--------|--------|---------|--------|--------|
| [eshaham/israeli-bank-scrapers](https://github.com/eshaham/israeli-bank-scrapers) | MIT | פעיל (~1.2k★) | בנקים ישראליים, credentials, Puppeteer | **Integrate** כ־BankDataProvider ראשון (worker נפרד; feature flag; הצפנת סיסמאות) |
| Feezback / Open-Finance.ai | ספק מסחרי | docs חיים | AIS מורשה, לאומי+ | **Buy/Integrate מאוחר** (Phase 4) — מחליף scrapers מאחורי אותה שכבה |
| Finanda Smart Aggregation | Enterprise | | לא self-serve לסטארטאפ | **Blocked / Reject** לשלב מוקדם |

**סיכון scrapers:** ToS בנקים, שבירות UI, אחסון סיסמאות — חובה בפיילוט מוגבל.

---

## 3. חתימות / שליחת קישור

| פרויקט | רישיון | יכולת לינק לחותמים | המלצה |
|--------|--------|---------------------|--------|
| מודול BINO עצמי + [szimek/signature_pad](https://github.com/szimek/signature_pad) | MIT | כן (בונים אנחנו + WhatsApp/SMS/Resend) | **Build + Integrate** ל־MVP (רוב) |
| [docusealco/docuseal](https://github.com/docusealco/docuseal) | AGPL-3 | כן, מייל/API | **Integrate כ־sidecar** בלבד / Cloud — לא fork לתוך Next |
| [OpenSignLabs/OpenSign](https://github.com/OpenSignLabs/OpenSign) | AGPL-3 | כן | כמו DocuSeal — **sidecar / Buy cloud** |
| PaperSign / docsign קטנים | MIT (לבדוק) | כן | **Evaluate** אם sidecar קל יותר מ־AGPL |

---

## 4. PDF / דוחות / גרפים / כסף

| פרויקט | רישיון | שימוש | המלצה |
|--------|--------|-------|--------|
| **OPC export-formats** (פנימי) | קנייני שלנו | PDF עברי RTL + Excel | **Integrate first** — חוסך הכי הרבה זמן |
| ExcelJS | כבר ב־`package.json` | CSV/XLSX | **Reuse** |
| [@react-pdf/renderer](https://github.com/diegomura/react-pdf) | MIT | PDF מ־React (כמו OPC) | **Integrate** ב־Phase 3 |
| [pdfme/pdfme](https://github.com/pdfme/pdfme) | MIT | תבניות PDF WYSIWYG | **Integrate אופציונלי** אם צריך designer למנהל |
| [apache/echarts](https://github.com/apache/echarts) | Apache-2.0 | גרפים פיננסיים כבדים | **Integrate** Phase 3 אם צריך |
| [recharts/recharts](https://github.com/recharts/recharts) | MIT | גרפים ב־React | **Integrate** מועדף ל־MVP דוחות (פשטות) |
| [dinerojs/dinero.js](https://github.com/dinerojs/dinero.js) | MIT | כסף בטוח | **Optional** — BINO כבר `roundMoney` + numeric; להוסיף רק אם צריך |
| bigcapital / ledger-ts מלא | משתנה / לא מתאים ל־SaaS בניין | ERP חשבונאי מלא | **Learn / Reject** כמוצר — לא להחליף את המודל של BINO |

---

## 5. השראת UX לתקציב / הוצאות (לא להעתיק מוצר)

אפליקציות expense/budget ב־Next (MIT) — **ללמוד UX בלבד**, לא למזג codebase:

| פרויקט | הערה | המלצה |
|--------|------|--------|
| Ledgerly / Ample / FinTrack / MoneyStyle | תקציב מול ביצוע, קטגוריות, דשבורד | **Learn** — מסכים ורעיונות; הנתונים חייבים להיות multi-tenant + RLS של BINO |

---

## 6. אוטומציה / רקע / Audit

| כלי | סטטוס ב־BINO | המלצה |
|-----|--------------|--------|
| Vercel Cron (`vercel.json`) | קיים (bulk-send, digests, …) | **Reuse** לרבעון / סנכרון בנק |
| Supabase / Postgres | קיים | Snapshots בטבלאות; בלי Edge Functions חדשות אלא אם צריך |
| failed_notifications / Resend / WhatsApp | קיים | הפצת דוחות וקישורי חתימה |
| Audit | חלקי (idempotency charges/ledger) | **Build** `audit_events` לתנועות כספיות/החלטות |

---

## 7. טבלת החלטה מרוכזת (Cursor)

| צורך | בחירה | נימוק |
|------|--------|--------|
| חיבור בנק עכשיו | `israeli-bank-scrapers` | MIT, מהיר לנתונים לדוחות; worker + flag |
| בנק לטווח ארוך | Feezback / Open-Finance | AIS מורשה; אותה שכבת `bank_transactions` |
| כסף/חישובים | `roundMoney` קיים (± dinero בהמשך) | לא לשבור ledger |
| הוצאות/תקציב | Build על מודל BINO | לא לייבא ERP זר |
| דוחות PDF | פורט מ־OPC + `@react-pdf` + ExcelJS | עיצוב מוכח בעברית |
| גרפים | Recharts קודם | פחות חיכוך מ־ECharts |
| חתימות | Build קישור + signature_pad | לינק לדיירים בלי AGPL במונולית |
| דירוג ספקים | PR2 על `professionals` | השראת OPC, עמודות DB |
| הצבעות/רוב | Build | אין מודול מוכן ב־OPC/Moked |

---

## 8. מה לא לעשות

- לא `npm install israeli-bank-scrapers` לתוך API route של Vercel בלי תוכנית worker.  
- לא להעתיק AGPL (DocuSeal/OpenSign) לתוך `app/`.  
- לא למזג אפליקציית expense tracker שלמה לתוך BINO.  
- לא להחליף Grow בגלל “ספריית ledger” חיצונית.
