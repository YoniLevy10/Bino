# סיווג חריגות collection_charges — paid בלי grow_approve_status=ok

**תאריך:** 2026-10-03  
**היקף:** READ-ONLY על Bamakor · **לא** שונו סטטוסים · **לא** בוצע Approve בדיעבד  
**ממצא:** B3 / משימה A4 · ממתין להחלטת owner (D3)

---

## סיכום מנהלים

נמצאו **4** חיובים במצב `paid` עם `grow_approve_status` null (לא `ok`).  
הם מתחלקים לשתי מחלקות ברורות. אין ראיה ב־`audit_log` לשורות אלה (ריק ל־entity_id).

| מחלקה | כמות | מסקנה | פעולה מוצעת (ממתינה לאישור) |
|--------|------|--------|------------------------------|
| A — ידני | 2 | תואם `markCollectionChargePaidManual` | תיעוד כ־manual; אופציונלי קוד עתידי `grow_approve_status='manual'` |
| B — Grow בלי Approve | 2 | יש txn+link, אין token | התאמה ידנית לחשבון Grow; **לא** Approve אוטומטי |

---

## מחלקה A — mark-paid ידני (2 שורות)

| שדה | ערכים אופייניים |
|-----|------------------|
| ids (פנימי) | `bf056fcb-…`, `ae13e85b-…` |
| created / paid | ~2026-09-06 / 2026-09-04–06 |
| grow_transaction_id | null |
| grow_transaction_token | null |
| grow_payment_link_id | null |
| grow_process_id | null |
| grow_approve_* | null |

**ראיית קוד:** [`markCollectionChargePaidManual`](../lib/collection-charge-ops.ts) מעדכן רק `status=paid` + `paid_at` — **ללא** `grow_approve_status`.

**סיווג:** לא בהכרח באג כספי; מסלול גיבוי מתועד ב־RUNBOOKS («סמן כשולם»).  
**סיכון דיווח:** דוחות שמצפים ל־`approve=ok` יספרו אותם כחריגים.

**אפשרויות טיפול (ללא ביצוע):**

1. להשאיר + לתעד בדוחות כ־manual.  
2. שינוי קוד **עתידי בלבד:** בעת mark-paid ידני לכתוב `grow_approve_status='manual'` (לא נוגע בשורות ישנות בלי החלטה).  
3. לא להריץ Approve — אין מזהי עסקה.

---

## מחלקה B — יש עסקת Grow, אין Approve (2 שורות)

| שדה | ערכים אופייניים |
|-----|------------------|
| ids (פנימי) | `e71e9022-…`, `49d9a0db-…` |
| created / paid | ~2026-09-28 |
| grow_transaction_id | **קיים** |
| grow_transaction_token | **null** |
| grow_payment_link_id | **קיים** |
| grow_approve_status | null |

**סיווג:** סביר שהדייר שילם ב־Grow והמערכת סימנה paid, אך **לא בוצע / לא ניתן** ApproveTransaction (חסר token).  
ייתכן נתיב ישן לפני הקשחת #17, או callback בלי token.

**אין לבצע Approve בדיעבד** רק כדי לאפס את החריגה — דורש:

1. כניסה לחשבון Grow של הלקוח והתאמת `transaction_id`.  
2. בדיקה אם העסקה כבר מאושרת אצל הספק.  
3. החלטת owner: תיעוד בלבד / השלמת Approve ידנית מממשק BINO אם יש token ממקור מהימן / פנייה ל־Grow.

---

## מה לא אומת

- התאמה חיה למסך Grow (אין credentials sandbox/ops בסוכן)  
- האם הכסף נכנס לחשבון הלקוח (דורש Grow dashboard)  
- מי לחץ mark-paid על מחלקה A (אין שורות audit)

---

## בקשת החלטה מ־owner

לכל מחלקה, סמנו אחת:

- [ ] **A1** השארה מתועדת כ־manual  
- [ ] **A2** קוד עתידי מסמן `manual` ב־mark-paid (בלי backfill / עם backfill מפורש)  
- [ ] **B1** בדיקה ידנית מול Grow ע״י owner + דיווח תוצאה  
- [ ] **B2** אחרי B1 — Approve ידני רק אם Grow מאשר שחסר אישור  
- [ ] **B3** תיעוד בלבד אם Grow מראה שכבר אושר
