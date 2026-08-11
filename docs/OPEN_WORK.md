# עבודה פתוחה — Branches & PRs

לוח מצב מול `main` ב־`YoniLevy10/Bamakor`.
עודכן: 2026-08-11.

## כללי ענפים

| כלל | פירוט |
|-----|--------|
| בסיס לפיתוח | תמיד מ־`main` (פרודקשן = Vercel מ־`main`) |
| שם ענף סוכן | `cursor/<תיאור-קצר>-e95c` (lowercase) |
| PR | טיוטה כברירת מחדל עד מוכן לסקירה |
| מיזוג | PR קטן וממוקד; לא לדחוף ענפי ניסוי ישנים בלי סיבה |
| `develop` | **לא** ענף עבודה יומי יותר — מיושר/מאחורי `main`. לא לפתוח ממנו פיצ׳רים חדשים |

ענפים ישנים רבים ב־remote הם שאריות סוכנים; אם אין PR פתוח — לא לגעת אלא אם צריך cherry-pick.

---

## PRs פתוחים עכשיו

| # | ענף | נושא | למה זה פתוח | המלצה |
|---|------|------|-------------|--------|
| **[#82](https://github.com/YoniLevy10/Bamakor/pull/82)** | `cursor/docs-sync-open-work-e95c` | סנכרון README / מילון / לוח זה | תיעוד מיושר ל־`main` | **למזג ראשון** (בסיס לשפה אחידה) |
| **[#81](https://github.com/YoniLevy10/Bamakor/pull/81)** | `cursor/for-managers-landing-video-e95c` | דף `/for-managers` + סרטון 60ש׳ | חומר מכירות | **לשמור** |
| **[#79](https://github.com/YoniLevy10/Bamakor/pull/79)** | `cursor/collections-ui-mockup-69ba` | יישור UI גבייה לסקיצה | ליטוש אחרי גבייה ב־`main` | **לשמור** — אחרי/עם #77 |
| **[#78](https://github.com/YoniLevy10/Bamakor/pull/78)** | `cursor/attendance-ops-cleanup-7e76` | תפעול חתמת NFC למנהל | השלמת פיצ׳ר תפעולי | **לשמור** — עדיפות מוצר |
| **[#77](https://github.com/YoniLevy10/Bamakor/pull/77)** | `cursor/merge-collections-payments-7e76` | איחוד «גבייה ותשלומים» | מיתוג מעל גבייה ב־`main` | **לשמור** — ואז לעדכן GLOSSARY |

### נסגר

| # | סיבה |
|---|------|
| **[#80](https://github.com/YoniLevy10/Bamakor/pull/80)** | ניסוי `/brag` — הוחלף ע״י #81 |

### סדר מיזוג מומלץ

1. **#82** תיעוד  
2. **#78** חתמת  
3. **#77** → **#79** גבייה  
4. **#81** שיווק  

---

## מה כבר ב־`main` (לא לפתוח מחדש)

- גביית ועד end-to-end + Morning (`/collections`) — #72 וכו׳
- ניתוח שימוש / Excel לסופר־אדמין
- Intake לוגו / פיילוט SMS
- תיקון Meta 132018 בשיבוץ עובד (#76)
- ניקוי אסתטי מגירת תקלה (#73)

---

## איך לעדכן את הלוח הזה

אחרי פתיחה/סגירה/מיזוג של PR:

```bash
gh pr list --state open
# לערוך את הטבלה למעלה + תאריך בראש הקובץ
```
