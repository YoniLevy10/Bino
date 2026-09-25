# Runbook — שיחת מכירה / הדגמת BINO

מדריך קצר לפתיחת הדגמה בשיחת מכירה, שליחת לינק שיווקי, ומיקום פאנל הלידים.  
פרטי טכני מלאים של טננט ההדגמה: [`docs/OPSBRAIN_DEMO.md`](./OPSBRAIN_DEMO.md).

---

## 1. פתיחת טננט OpsBrain לשיחת מכירה

OpsBrain הוא **טננט הדגמה משותף** — לא יוצרים לקוח חדש לכל פרוספקט. מחדשים מיתוג (שם, בניינים, תקלות, לוגו) על אותו חשבון.

| | UUID |
|--|--|
| Client | `07773bb3-4969-4bce-8ce2-faab3b26383c` |
| Organization | `a281af3c-99b6-4a4a-a5ba-9498e05e984e` |

### לפני השיחה

1. **Seed / re-skin** — ערכו והריצו `scripts/seed-opsbrain-chaim-bajayo-demo.sql` (או עותק מתוארך) ב-Supabase SQL editor.  
   בטוח להריץ שוב: מוחק קודם את שורות ההדגמה של הלקוח הזה.
2. **לוגו** — העלאה ב-Superadmin.
3. **משתמש כניסה** — צרו/רעננו את משתמש האימייל+סיסמה:
   ```bash
   # דורש SUPABASE_SERVICE_ROLE_KEY ב-.env.local
   npx tsx scripts/ensure-opsbrain-demo-user.ts
   ```
   חלופה בלי service-role: `scripts/ensure-opsbrain-demo-user.sql` ב-SQL editor.
4. **Smoke-test** — `/login` → אימייל+סיסמה → דשבורד עם נתוני OpsBrain. בדקו בקצרה גבייה + נוכחות/החתמות.

ברירת מחדל (ניתן לדרוס ב-env): `DEMO_LOGIN_EMAIL` / `DEMO_LOGIN_PASSWORD` — ראו `OPSBRAIN_DEMO.md`.

בשיחה: שתפו עם הפרוספקט `/login` + אימייל+סיסמה (לא Google, אלא אם הזמנתם את ה-Gmail שלו).

---

## 2. לינק שיווקי לשליחה

שלחו את **שורש האתר הציבורי**:

| | |
|--|--|
| נתיב | `/` |
| תוכן | דף נחיתה BINO עם CTA לוואטסאפ + סרטון מערכת (~33ש׳) |
| מספר | **054-810-2688** (`wa.me/972548102688`) |
| סרטון | `/marketing/bino-system-demo.mp4` (גם ב־`appshot-video/` לרינדור מחדש) |

דוגמה לטקסט קצר:

> שלום, כאן קישור קצר ל-BINO — זיכרון תפעולי חכם לבניינים:  
> https://\<domain\>/

אופציונלי להדפסה / מצגת: [`/savings-report`](/savings-report) — דוח חיסכון לדוגמה (מספרי דוגמה בלבד).

---

## 3. איסור מוחלט: אוטומציה של וואטסאפ קר ללידים

**לעולם לא** לשלוח הודעות וואטסאפ אוטומטיות ללידים קרים (bulk / cron / API auto-DM).

סיבות: חוק אנטי-ספאם בישראל + סיכון חסימה מ-Meta.

פנייה ללידים היא **ידנית בלבד** מפאנל Superadmin (`wa.me` / העתקת תבניות). תבניות ב-`lib/sales-leads/outreach-templates.ts` — למעקב A/B ידני, לא לשליחה אוטומטית.

---

## 4. פאנל לידי מכירה (Superadmin)

| | |
|--|--|
| נתיב | `/superadmin` |
| טאב | **לידים** |
| רכיב | `app/superadmin/components/SalesLeadsPanel.tsx` |
| API | `/api/superadmin/sales-leads*` |

מה עושים שם: תור פנייה, סינון לפי התאמה/סטטוס, פתיחת WhatsApp ידנית מהכרטיס, עדכון סטטוס, גילוי ידני.

תיעוד מנוע הלידים: [`docs/SALES_LEADS_AGENT.md`](./SALES_LEADS_AGENT.md).

---

## צ׳קליסט מהיר לשיחה

- [ ] Seed OpsBrain מעודכן לפרוספקט
- [ ] לוגו + `ensure-opsbrain-demo-user`
- [ ] כניסה נבדקת ב-`/login`
- [ ] לינק שיווקי `/` מוכן לשליחה
- [ ] (אופציונלי) `/savings-report` להדפסה
- [ ] לידים — רק פנייה ידנית מ-`/superadmin` → לידים
