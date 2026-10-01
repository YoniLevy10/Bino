# תוכנית ביצועים לפי דף — BINO Manager

תאריך: 2026-10-01 (עודכן אחרי גל 1+2)  
סביבת מדידה: `https://bino.casa` (OpsBrain demo)  
ענף: `cursor/perf-page-wave1-0484` / PR #223

## מדדים

| מדד | משמעות |
|-----|--------|
| T_nav | לחיצה בניווט → תוכן משמעותי ראשון |
| T_full | עד סיום טעינת הרשימה הראשית |
| T_detail | פתיחת פרטי שורה (Drawer / מודאל עריכה) |

יעדי מוצר (warm nav): T_nav &lt; 300ms תחושתי, T_full &lt; 1s לרשימות יומיומיות.

## Baseline (production לפני המיזוג)

| Route | T_nav_ms | T_full_ms | T_detail_ms |
|-------|----------|-----------|-------------|
| `/dashboard` | ~800 | ~1500 | — |
| `/tickets` | ~700 | ~3000 | ~800 |
| `/projects` | ~600 | ~2000 | ~1200 |
| `/residents` | ~600 | ~1800 | — |
| `/workers` | ~600 | ~2000 | — |
| `/tasks` | ~700 | ~3000 | — |
| `/site-tours` | ~700 | ~3000 | — |
| `/summary` | ~600 | ~1800 | — |
| `/settings` | ~700 | ~3000 | — |
| `/addons` | ~600 | ~1800 | — |
| `/whatsapp-inbox` | ~700 | ~3000 | — |

## גל 1 — הושלם

- [x] workers / projects / residents על RQ + hydrate
- [x] dynamic TicketDetailDrawer + מודאלי דיירים
- [x] מקביליות פרטי תקלה
- [x] residents page size 100 + order יציב (#45)
- [x] collections summary pagination (#31)
- [x] tasks pagination (#44)

## גל 2 — הושלם

- [x] **settings** — טעינת Grow/webhook רק בטאב Grow (`Promise.all`); deep-link ל־team
- [x] **professionals** — RQ + page size 100 + «טען עוד»
- [x] **summary history** — ברירת מחדל חודש; API `limit/offset` (max 2000); באנר truncation + «טען עוד»
- [x] **collections bulk-send** — תור async (202 + poll) + מיגרציה `119` + cron resume (#29)
- [x] **ui theme leaf** — `app/components/ui/theme.ts` (ייבוא קל ל־theme-only)
- [x] **middleware matcher** — החרגת נכסים סטטיים/SEO/PWA (בלי שינוי tenant JWT)

## אימות אחרי deploy

1. Login → dashboard → tickets → workers → residents → projects (warm nav)
2. Settings → טאב כללי מהיר; טאב Grow טוען webhook/onboard
3. Summary → היסטוריה: חודש + טען עוד
4. Collections → שליחה מרוכזת מחזירה 202 ומתעדכנת בפול
5. `node scripts/perf-nav-timing.mjs` עם `DEMO_LOGIN_PASSWORD`
