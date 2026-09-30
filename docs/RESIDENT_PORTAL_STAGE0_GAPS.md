# פורטל דיירים — שלב 0: פערים וחסימות

תאריך: 2026-09-30  
ענף: `cursor/resident-portal` (מבוסס `main` @ `1732e09` + Midrag מ־PR #176)

## מה אומת

| פריט | סטטוס |
| --- | --- |
| ענף מ־main | נוצר `cursor/resident-portal`, working tree נקי לפני השינויים |
| Midrag | cherry-pick של `lib/midrag/external-search.ts` + UI professionals מ־PR #176 |
| טבלאות portal מוצעות | לא קיימות במיגרציות / `database.types.ts` |
| `project_units` / `project_buildings` | לא קיימות; דירה = `residents.apartment_number` טקסט |
| OTP טלפון | 019SMS קיים להתראות בלבד; אין Supabase phone Auth |
| Auth callback | חותך משתמש ללא `organization_users` → חוסם דיירים |
| Middleware | דורש לקוח ארגוני יחיד; אין מסלול `/resident` |
| סכמה חיה | **חסימה:** אין `supabase link` / `.env.local` / `SUPABASE_ACCESS_TOKEN` בסביבה |

## החלטות ליישום

1. Email OTP / magic link לפיילוט (לא Phone OTP).
2. דיירים לא נכנסים ל־`organization_users`.
3. שימוש ב־`audit_log` הקיים לפעולות portal.
4. דגל `projects.resident_portal_enabled` לפיילוט פרויקט אחד.
5. מידרג = deep link בלבד (אין API הזמנות).

## דוח התאמות דירות (לוגיקה)

- יצירת `project_units` מ־`apartment_number` ייחודי לכל `project_id` כשאין `building_number` מפורש.
- רשומות עם אותו מספר דירה בפרויקט רב־בנייני (רמז מ־`tickets.building_number` מגוון) → **לא** מקשרים אוטומטית; נשארות בדוח חסימה.
- `resident_id` וחיובים היסטוריים נשמרים.

## פערים פתוחים לפיילוט

- בחירת לקוח/פרויקט פיילוט אמיתי (תפעולי).
- הגדרת Redirect URLs ב־Supabase ל־`/auth/callback?next=/resident`.
- קישור Supabase לאימות מיגרציות מול פרודקשן לפני apply.
