# הסבת משפך לידים (107_sales_lead_funnel)

## לפני הסבה (ייצור, קריאה בלבד ב־2026-09-30)

| מטריקה | ערך |
|--------|-----|
| סה״כ לידים | 585 |
| `discovered` | 581 |
| `contacted` | 4 |

## באג שנמצא בהרצה

הגרסה הראשונה של `107` מיפתה סטטוסים **לפני** הורדת `sales_leads_status_check`, ולכן נכשלה עם `23514` על ערך `new`. תוקן: קודם `DROP CONSTRAINT`, אחר כך מיפוי, אחר כך `ADD CONSTRAINT` החדש. אם הריצה נכשלה בטרנזקציה — הכול התגלגל חזרה; אפשר להריץ שוב את הקובץ המעודכן.

## מיפוי סטטוס → שלב

| ישן | חדש | הערות |
|-----|-----|--------|
| discovered | new | |
| qualified | new | דירוג fit נשאר ב־`fit_class` |
| contacted | contact_attempt | עניין נשאר `unknown` |
| demo_scheduled | demo_scheduled | |
| won | customer | |
| lost | lost | |
| rejected | deferred | לבדיקה ידנית |
| do_not_contact | lost | `lost_reason=do_not_contact` |

`legacy_status` נשמר. רמת עניין **לא** מוסקת מסטטוס.

## אחרי הסבה (להריץ אחרי apply_migration)

```sql
select status, count(*) from sales_leads group by 1 order by 2 desc;
select count(*) from sales_leads where legacy_status is not null;
select count(*) from sales_lead_tasks where status='open';
select count(*) from sales_lead_activities where payload->>'migrated_from'='sales_leads.notes';
```

## הגדרות נדרשות

```bash
BINO_SALES_OPERATORS='[{"id":"<uuid>","name":"…","email":"…"},{"id":"<uuid>","name":"…"},{"id":"<uuid>","name":"…"}]'
```

מזהי UUID יציבים לכל אחד משלושת אנשי הצוות. Superadmin נשאר מאובטח ב־`ADMIN_SETUP_SECRET`; זהות CRM נשלחת ב־`x-sales-operator-id`.

## מה לא להריץ במשימה זו

- אין `apply_migration` לייצור מסוכן זה.
- אין שינוי נתוני לידים קיימים מחוץ למיגרציה.
