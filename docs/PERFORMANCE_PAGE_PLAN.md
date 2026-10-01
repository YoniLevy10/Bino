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

## ממצאי מדידה חיה (baseline — production לפני merge של גל 1)

מדידת דפדפן על `https://bino.casa` (OpsBrain demo), 2026-10-01.  
זמנים בקרוב ל־ms (קיר cold/warm מעורב באותה סשן; יעד warm: T_nav &lt; 300ms, T_full &lt; 1s).

| Route | T_nav_ms | T_full_ms | T_detail_ms | Notes |
|-------|----------|-----------|-------------|-------|
| `/dashboard` | ~800 | ~1500 | — | KPIs + טבלת פעילות |
| `/tickets` | ~700 | ~3000 | ~800 | ספינר ראשוני; Drawer תקלה #201 |
| `/projects` | ~600 | ~2000 | ~1200 | Drawer: מידע מהיר, תקלות פעילות ב־waterfall (~+800ms) |
| `/residents` | ~600 | ~1800 | — | לחיצת «עריכה» לא נתפסה במדידה (מודאל) |
| `/workers` | ~600 | ~2000 | — | כרטיסי עובדים; פרטי Drawer לא נפתחו בלחיצת עריכה |
| `/tasks` | ~700 | ~3000 | — | ספינר; משימה אחת בדמו |
| `/site-tours` | ~700 | ~3000 | — | empty state |
| `/summary` | ~600 | ~1800 | — | KPIs + עומס פרויקטים |
| `/settings` | ~700 | ~3000 | — | ספינר; כמה סקשנים |
| `/addons` | ~600 | ~1800 | — | 8 תוספים |
| `/whatsapp-inbox` | ~700 | ~3000 | — | «טוען…» ואז empty |

תובנות UX מהמדידה: shell נטען לפני הנתונים (T_nav סביר יחסית ל־T_full); ספינר לוגו+פס בכל הדפים הכבדים; waterfall בפרטי פרויקט.

### מיפוי ממצא → תיקון גל 1

| Route | צוואר בקבוק (קוד + מדידה) | תיקון בגל 1 |
|-------|---------------------------|-------------|
| `/dashboard` | RQ קיים; T_full ~1.5s מ־KPI משניים | ללא שינוי middleware; דחיית KPI בגל 2 |
| `/tickets` | T_full ~3s; Drawer ב־bundle | `next/dynamic` + logs∥attachments |
| `/workers` | T_full ~2s; לא שותף RQ | `useTenantWorkersList` + LS→RQ |
| `/projects` | T_full ~2s; detail waterfall | RQ משותף; תקלות detail עדיין async |
| `/residents` | T_full ~1.8s; עמודים גדולים | page size 100 + order יציב + RQ |
| `/tasks` | T_full ~3s | pagination API + «טען עוד» |
| `/collections` | לא נמדד (addon) | `fetchAllRows` ל־summary (#31) |
| `/settings` | T_full ~3s | גל 2 — Promise.all |
| `/summary`, `/professionals`, addons אחרים | T_full 1.8–3s | גל 2 לפי עדיפות |

### פרטי ישות (חובה)

| זרימה | מדידה | תיקון |
|-------|--------|-------|
| פרטי תקלה | T_detail ~800ms | טעינה במקביל ל־logs+attachments |
| פרטי פרויקט | T_detail ~1200ms (waterfall תקלות) | RQ לרשימה; תקלות נשארות async |
| פרטי עובד / עריכת דייר | לא נמדדו במדויק (UI click miss) | RQ + dynamic למודאלי דיירים |

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
