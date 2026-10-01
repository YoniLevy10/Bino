# תוכנית ביצועים לפי דף — BINO Manager

תאריך: 2026-10-01  
סביבת מדידה: `https://bino.casa` (OpsBrain demo)  
גל יישום ראשון: branch `cursor/perf-page-wave1-0484`

## מדדים

| מדד | משמעות |
|-----|--------|
| T_nav | לחיצה בניווט → תוכן משמעותי ראשון |
| T_full | עד סיום טעינת הרשימה הראשית |
| T_detail | פתיחת פרטי שורה (Drawer / מודאל עריכה) |

יעדי מוצר (warm nav אחרי ביקור ראשון בטאב): T_nav &lt; 300ms תחושתי, T_full &lt; 1s לרשימות יומיומיות.

## ממצאי מדידה חיה

ניסיון מדידה אוטומטית מול `https://bino.casa` עם `savion@bamakor.com` נכשל ב-login (401 — סיסמת הדמו בסביבת הסוכן לא תואמת production; אין `DEMO_LOGIN_PASSWORD` / service role ב-env של ה-agent). סוכן דפדפן רץ במקביל; אם יצליח — הזמנים יעודכנו ב-artifacts.

בינתיים התוכנית והתיקונים מבוססים על **ביקורת קוד מלאה** של כל לשוניות המנהל + דפוסי fetch (ראה גם audit #29/#31/#44/#45).

| Route | מצב לפני גל 1 | צוואר בקבוק עיקרי | תיקון בגל 1 |
|-------|---------------|-------------------|-------------|
| `/dashboard` | RQ + LS + Realtime | KPI/logs משניים אחרי paint | נשאר; ללא שינוי middleware |
| `/tickets` | RQ חם; Drawer סטטי | Bundle של TicketDetailDrawer; logs→attachments בטור | `next/dynamic` ל-Drawer; Promise.all ל-logs+attachments |
| `/workers` | useEffect + LS בלבד | לא שותף RQ עם dashboard/tickets | `useTenantWorkersList` + hydrate LS→RQ |
| `/projects` | useEffect כפול | לא שותף RQ | `useTenantProjectsList` + `useTenantWorkersList` |
| `/residents` | עמודים של 500; סדר לא יציב | Paint כבד; bulk-delete סדרתי | page size 100 + order יציב; RQ; Promise.all למחיקה; dynamic למודלים |
| `/tasks` | תקרה 300 בלי pagination | טעינת כל המשימות | `limit/offset/filter` + כפתור "טען עוד" |
| `/collections` | summary בלי pagination | PostgREST חותך ב-1000 | `fetchAllRows` לסיכום |
| `/summary` | דף גדול | history יכול להיות כבד | גל 2 (קיצוב טווח) |
| `/settings` | כמה API בטור | waterfall ב-mount | גל 2 |
| `/professionals` | select מלא | unbounded | גל 2 + RQ |
| `/whatsapp-inbox` | RQ קיים | Realtime בערוץ פתוח | ניטור בלבד |
| `/attendance` | limit 500 | נדיר בדמו | ניטור |
| `/calendar`, `/campaigns`, `/site-tours`, `/qr`, `/addons` | קלים יחסית | — | עדיפות נמוכה |

### פרטי ישות (חובה)

| זרימה | מצב | תיקון |
|-------|-----|-------|
| פרטי עובד (Drawer) | נפתח מיד; תקלות limit 10 | RQ לרשימה מאיץ הגעה ללחיצה |
| עריכת דייר (מודאל) | מודאל כבד ב-bundle הראשוני | `next/dynamic` ל-Add/Import/Share |
| פרטי תקלה | logs ואז attachments | טעינה במקביל |
| פרטי פרויקט | תקלות open/closed בנפרד | RQ לרשימת פרויקטים |

## צווארי בקבוק משותפים

1. **Middleware `getUser()`** בכל מעבר מאומת — לא נוגעים ב-tenant service-role (P0). אופטימיזציה עתידית ב-PR ייעודי בלבד.
2. **`app/components/ui.tsx` גדול** — ייבוא רחב בכל דף; גל 2 לפיצול.
3. **דפים `'use client'` מונוליתיים** — warm path דרך RQ + LS hydrate (כמו tickets).

## גל 1 (ב-PR זה)

- [x] workers / projects / residents על RQ + hydrate
- [x] dynamic TicketDetailDrawer + מודאלי דיירים
- [x] מקביליות פרטי תקלה
- [x] residents page size 100 + order יציב (#45)
- [x] collections summary pagination (#31)
- [x] tasks pagination (#44)

## גל 2 (PR נפרד)

- collections bulk-send durable job (#29)
- settings Promise.all + lazy sections
- professionals RQ + search
- summary history קיצוב
- פיצול `ui.tsx` / mega pages
- middleware matcher / getUser — רק עם smoke login ייעודי

## אימות מומלץ אחרי deploy

1. Login → `/dashboard` → `/tickets` → `/workers` → `/residents` → `/projects` (warm nav)
2. פתיחת פרטי עובד + עריכת דייר + פרטי תקלה
3. `/tasks` — טען עוד
4. `/collections` summary עם &gt;1000 חיובים (אם יש)
