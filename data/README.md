# דיירים — קבצים פעילים

הייבוא הושלם (688 שורות). נשארו רק הקבצים האלה:

| קובץ | מתי להשתמש |
|------|------------|
| `import-residents.sql` | ייבוא מחדש של חסרים בלבד (נדיר) |
| `cleanup-duplicates.sql` | מחיקת כפילויות (אותו בניין+דירה+שם) — **הרץ אם עדיין לא** |
| `residents-count.sql` | בדיקה מהירה: כמה דיירים פעילים |
| `parsed-residents.json` | מקור הנתונים מה-PDF (למפתחים) |
| `residents-directory.pdf` | הקובץ המקורי |

**סדר ניקוי כפילויות:** הרץ `cleanup-duplicates.sql` (BEGIN…COMMIT), אחר כך `residents-count.sql`.

שינוי סכמה (טלפון בכמה דירות): כבר ב-`supabase/migrations/084_resident_phone_per_apartment.sql`.
