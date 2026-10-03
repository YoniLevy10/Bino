# סיווג חריגות collection_charges — paid בלי grow_approve_status=ok

**תאריך:** 2026-10-03 (רענון תיעוד D3)  
**היקף:** READ-ONLY על Bamakor · **לא** שונו סטטוסים · **לא** בוצע Approve בדיעבד  
**ממצא:** B3 / משימה A4 · החלטת owner נוכחית: **תיעוד + התאמה מול Grow** (ללא שינוי כספי לפני הצגת תוצאות)

---

## סיכום מנהלים

נמצאו **4** חיובים במצב `paid` עם `grow_approve_status` null (לא `ok`).  
הם מתחלקים לשתי מחלקות ברורות. אין ראיה ב־`audit_log` לשורות אלה (ריק ל־entity_id).

| מחלקה | כמות | מסקנה | סטטוס D3 |
|--------|------|--------|----------|
| A — ידני | 2 | תואם `markCollectionChargePaidManual` | **מתועד** (מקור + סיבה למטה) |
| B — Grow בלי Approve אצלנו | 2 | יש txn+link, אין token | **ממתין להתאמת Grow dashboard** — אין token ≠ הוכחה ש־Approve לא בוצע |

---

## מחלקה A — mark-paid ידני (2 שורות) — מתועד

| id | client | amount | created_at (UTC) | paid_at (UTC) | מקור | סיבה |
|----|--------|--------|------------------|---------------|------|------|
| `bf056fcb-bc68-4914-a0c3-ee62c297fef6` | סביון (`07773bb3-…`) | 450.00 | 2026-09-06 16:37:34 | 2026-09-06 16:37:34 | מסלול ידני BINO (`markCollectionChargePaidManual`) | אין `grow_transaction_id` / link / process / token; `grow_approve_*` null — תואם סימון «שולם» ללא עסקת Grow |
| `ae13e85b-f464-4611-9f07-8fd6d67d31a1` | סביון (`07773bb3-…`) | 450.00 | 2026-09-06 16:37:34 | 2026-09-04 16:37:34 | מסלול ידני BINO (`markCollectionChargePaidManual`) | אותו דפוס; `paid_at` לפני `created_at` מחזק סימון ידני/גיבוי ולא webhook |

**ראיית קוד:** [`markCollectionChargePaidManual`](../lib/collection-charge-ops.ts) מעדכן רק `status=paid` + `paid_at` — **ללא** `grow_approve_status`.

**אין לבצע Approve** — אין מזהי עסקה.

---

## מחלקה B — txn + payment_link, אין token אצלנו (2 שורות)

| id | client | amount | grow_transaction_id | grow_payment_link_id | has_token | grow_approve_status | created / paid (UTC) |
|----|--------|--------|---------------------|----------------------|-----------|---------------------|----------------------|
| `e71e9022-2a32-48eb-9d66-c6177ae52f82` | Bamakor (`7573f5ad-…`) | 1.00 | `sim-tx-176116657` | `71163` | false | null | 2026-09-28 09:55 / 10:25 |
| `49d9a0db-4bb0-488e-ac99-0209d833a4bc` | Bamakor (`7573f5ad-…`) | 1.00 | `audit-tx-form-2` | `71167` | false | null | 2026-09-28 10:38 / 10:44 |

**הערה על שמות txn:** `sim-tx-…` / `audit-tx-…` נראים כמו עסקאות סימולציה/ביקורת — לא בהכרח חיוב לקוח חי.

### רשימת התאמה מול Grow (לביצוע owner / ops — ללא שינוי אצלנו)

לכל שורה, במסך Grow של הדייר/העסק הרלוונטי בדקו ורשמו:

1. **סטטוס עסקה** לפי `grow_transaction_id`  
2. **סכום** מול `amount` (1.00)  
3. **סטטוס Approve** אצל Grow (אושר / ממתין / לא רלוונטי)

| txn id | סטטוס עסקה (Grow) | סכום (Grow) | Approve (Grow) | הערת owner |
|--------|-------------------|-------------|----------------|------------|
| `sim-tx-176116657` | _ממתין למילוי_ | _ממתין_ | _ממתין_ | |
| `audit-tx-form-2` | _ממתין למילוי_ | _ממתין_ | _ממתין_ | |

**כללים מחייבים עד להצגת תוצאות ההתאמה:**

- היעדר `grow_transaction_token` אצלנו **אינו** הוכחה ש־Approve לא בוצע ב־Grow.  
- **אין** לקרוא ApproveTransaction / לשנות `status` / `grow_approve_status` לפני התאמה והצגת תוצאות.  
- הסוכן **לא** מבצע חיובים או שינויי נתוני לקוח במסגרת אישור זה.

---

## מה לא אומת עדיין בסוכן

- התאמה חיה למסך Grow (אין גישת dashboard Grow לסוכן; מפתחות פלטפורמה לא משמשים לאימות היסטורי בלי token)  
- האם הכסף נכנס לחשבון (דורש Grow dashboard)  
- מי לחץ mark-paid על מחלקה A (אין שורות audit)

---

## בקשת החלטה מ־owner (אחרי מילוי טבלת Grow)

- [x] **A** — תיעוד כ־manual עם מקור וסיבה (בוצע למעלה)  
- [ ] **B** — מילוי תוצאות התאמת Grow בטבלה; רק אז החלטה על תיעוד בלבד / פעולה כספית
