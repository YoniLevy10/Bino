# פורטל דיירים — פיילוט והפעלה

## מה יושם (ענף `cursor/resident-portal`)

1. **זהות והרשאות** — `resident_portal_memberships` / invites, Email OTP, `requireResidentContext`, middleware נפרד מ־organization_users.
2. **מידע בניין** — הודעות, מתקנים, מסמכים עם `visibility=residents`.
3. **תשלומים** — רשימת חיובים מפורסמים + תשלום דרך `/pay/[token]` הקיים.
4. **תקלות ובוט** — טופס, שיחה, שירות יצירה משותף, מידרג deep-link (ללא API הזמנות).
5. **ניהול** — פאנל ״פורטל דיירים״ במסך פרויקט.

## מיגרציות להרצה (לפני פיילוט)

```
107_resident_portal_foundation.sql
108_resident_portal_content.sql
109_resident_portal_payments.sql
110_resident_portal_tickets.sql
```

**חסימה:** בסביבת הסוכן אין `supabase link` — יש להריץ מול הפרויקט המקושר אצלכם ולאמת עם `npm run db:types`.

## הפעלת פיילוט — בניין אחד

1. בחרו פרויקט יחיד.
2. במסך פרויקט → פורטל דיירים: סמנו ״מופעל״, הזינו **עיר** מפורשת.
3. צרו הזמנה לדייר (דוא״ל) והעתיקו את קישור ה־accept.
4. ודאו addon גבייה + Grow ללקוח אם בודקים תשלומים.
5. פרסמו הודעה / מתקן / מסמך (publish) לפני בדיקת מסך מידע.
6. אל תפעילו פרויקטים נוספים לפני משוב ומדדים.

## מדדים

- הצלחת כניסה (OTP)
- הפעלת הזמנות
- השלמת תשלום (סטטוס שרת, לא URL)
- שגיאות הרשאה (403 בין לקוחות/דירות)
- פתיחת קריאה (כולל idempotency)
- ביצועי טעינת `/resident`

## בדיקות קבלה חובה

ראו `docs/BINO_Resident_Portal_Plan_HE.md` §11. יחידות רצות: `tests/resident-portal-*.test.ts`, `tests/midrag-external-search.test.ts`.

## מחוץ לפיילוט

Phone OTP, הוראת קבע, יצירת חיובים חודשיים אוטומטית, הזמנת מתקנים, Midrag booking API.
