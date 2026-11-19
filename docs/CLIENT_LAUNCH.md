# הקמת לקוח חדש ב-BINO

**מודל:** פרויקט Vercel אחד · Meta App אחת · מספר 019 אחד = SMS + WhatsApp · נתונים פר-לקוח ב-Supabase.

**מסלול מוצר:** סופר-אדמין → **אשף הקמה מלא** (`#launch/new` או לקוח → «המשך הקמה מלאה»).

צ׳קליסט הקמה מציג סטטוס חי; האשף מאפשר להשלים הכל במקום אחד (כולל Access Token, Grow, Financy, PalGate, Excel בניינים/דיירים).

---

## סדר פעולה בזמן אמת

| # | פעולה | איפה |
|---|--------|------|
| 1 | צרו לקוח ב-BINO | `/superadmin` → **+ לקוח חדש** / `#launch/new` |
| 2 | בניינים + דיירים + עובדים | אשף שלבים 2–4 (Excel או ידני) |
| 3 | קנו מספר ב-019 | 019 — מספר אחד בלבד |
| 4 | חברו את **אותו** מספר ב-Meta App | Meta → Phone Number ID + Token |
| 5 | הדביקו ב-BINO | אשף → WhatsApp/SMS (כולל Access Token) |
| 6 | Grow | אשף → גבייה: תוסף + userId + פרטי עסק |
| 7 | Financy / PalGate (אופציונלי) | אשף שלבים 7–8 |
| 8 | slug + לוגו + בדיקות | אשף → מיתוג + סיכום |

שלושת השלבים החיצוניים: **019 → Meta → Grow GetLink**.  
כל ההדבקה והנתונים — **רק בסופר-אדמין**.

---

## מה משותף (פלטפורמה — פעם אחת ב-Vercel)

| משאב | איפה | הערה |
|------|------|------|
| אפליקציה | Vercel project `bino` | אין פרויקט פר-לקוח |
| Meta App | Meta Developer | Verify token + App secret משותפים |
| Webhook WhatsApp | `/api/webhook/whatsapp` | כתובת אחת; זיהוי לפי `phone_number_id` |
| 019SMS API | `SMS_019_*` | חשבון API אחד |
| Grow platform | `GROW_*` | סליקה כפלטפורמה |
| Resend | `RESEND_*` | From פר-לקוח: `{slug}@bino.casa` |
| PalGate (legacy pilot) | `PALGATE_*` | fallback; לקוחות חדשים — עמודות ב-`clients` |

---

## פירוט פר-לקוח (באשף)

1. **זהות** — שם, תוכנית, אימייל מנהל (+ סיסמה או הזמנה), טלפון  
2. **בניינים** — Excel/תבנית או שורות ידניות  
3. **דיירים** — Excel (בניין / דירה / שם / טלפון)  
4. **עובדים** — שורות ידניות  
5. **WhatsApp/SMS** — `sms_sender_name` (972…), Phone Number ID, Access Token, SMS toggles  
6. **Grow** — תוסף גבייה, `grow_user_id`, פרטי עסק ל-`/vaad-pay`  
7. **Financy** — client id / secret / userId  
8. **PalGate** — device / phone / session token / type → מפעיל תפריט חניונים  
9. **מיתוג** — `email_slug`, לוגו  
10. **סיכום** — צ׳קליסט + בדיקות חיות  

מדריך בדיקות: [`CLIENT_SOFT_LAUNCH_SMOKE.md`](./CLIENT_SOFT_LAUNCH_SMOKE.md)

---

## Soft launch — חובה

- [ ] WhatsApp נכנס → תקלה תחת הלקוח הנכון  
- [ ] SMS עם מספר השולח של הלקוח  
- [ ] (אם גבייה) חיוב ₪1 → שולם  
- [ ] מייל מ-`{slug}@bino.casa`  
- [ ] פורטל עובד / דייר (אם רלוונטי)  
