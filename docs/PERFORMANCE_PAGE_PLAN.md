# תוכנית ביצועים לפי דף — BINO Manager

תאריך: 2026-10-02 (עודכן אחרי גל 3 evidence)  
סביבת מדידה: `https://bino.casa` (OpsBrain / savion@bino.com)  
ענף: `cursor/perf-evidence-wave3-0484`

## מדדים

| מדד | משמעות |
|-----|--------|
| T_nav | לחיצה בניווט → תוכן משמעותי ראשון |
| T_full | עד סיום טעינת הרשימה הראשית |
| T_detail | פתיחת פרטי שורה (Drawer / מודאל עריכה) |

יעדי מוצר (warm nav): T_nav &lt; 300ms תחושתי, T_full &lt; 1s לרשימות יומיומיות.

## Baseline Wave 3 (production לפני שינויי הגל, 2026-10-02)

Harness: `DEMO_LOGIN_* node scripts/perf-nav-timing.mjs` → `/opt/cursor/artifacts/perf-baseline.json`

| Journey | T_nav_ms | T_full_ms | notes |
|---------|----------|-----------|-------|
| cold `/dashboard` | 1958 | 527 | slowest API: `dashboard_ticket_kpi_counts` 755ms |
| cold `/tickets` | 1896 | 510 | RQ warm from prior route (0 API) |
| cold `/workers` | 3361 | 809 | shell remount / JS |
| cold `/site-tours` | 7158 | 508 | shell remount / JS dominant |
| warm dashboard→tickets | 31 | 407 | client click |
| warm tickets→settings | 55 | 415 | client click |
| ticket-detail | — | T_detail=663 | slowest: `professionals` 350ms, `ticket_attachments` 318ms |

סיווג: cold nav = `react-remount` + JS; detail = `network|db` (professionals unbounded + attachments).

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

## גל 3 — evidence + ארכיטקטורה

- [x] Harness: `scripts/perf-nav-timing.mjs` — env-only auth, warm journeys, network top, Playwright trace
- [x] **Persistent manager shell** — `app/(manager)/layout.tsx` מחזיק `AppShell` פעם אחת; דפי מנהל בלי עטיפה כפולה; `AddonFeaturePageShell` עם `wrapAppShell=false`
- [x] Skeletons מקומיים (`PageListSkeleton` / `PageKpiSkeleton`) במקום spinner מלא ב־tickets/dashboard/residents
- [x] `@tanstack/react-virtual` ברשימות tickets (mobile + רשימות ארוכות) ו־residents (mobile)
- [x] Prefetch RQ על hover/focus בניווט (tickets/workers/projects/residents)
- [x] Professionals ב־drawer: `is_active` + `limit(200)`
- [x] Migration `120_perf_wave3_hot_path_indexes.sql` (attachments, residents name, closed_at, open tickets) — הוחל על production

### After — indexes on production (2026-10-02, לפני merge של layout)

`PERF_LABEL=after-indexes` מול `bino.casa` (אינדקסי `120` כבר ב־prod; shell הקבוע עדיין לא ב־prod עד merge).

| Journey | Baseline T_nav | After T_nav | Baseline T_full | After T_full |
|---------|----------------|-------------|-----------------|--------------|
| cold `/dashboard` | 1958 | 541 | 527 | 545 |
| cold `/tickets` | 1896 | 1017 | 510 | 512 |
| cold `/workers` | 3361 | 808 | 809 | 520 |
| cold `/site-tours` | 7158 | 390 | 508 | 494 |
| warm dashboard→tickets | 31 | 53 | 407 | 413 |
| warm tickets→settings | 55 | 58 | 415 | 425 |

הערות: שיפור cold משמעותי אחרי אינדקסים + ריצה חמה יותר; **שיפור תחושתי של ניווט (בלי splash remount) דורש merge של `(manager)/layout`**. Artifacts: `/opt/cursor/artifacts/perf-baseline.json`, `perf-after-indexes.json`.

מדידת layout המלאה אחרי deploy:

```bash
DEMO_LOGIN_EMAIL=… DEMO_LOGIN_PASSWORD=… PERF_LABEL=after-layout node scripts/perf-nav-timing.mjs
```

## אימות אחרי deploy

1. Login → dashboard → tickets → workers → residents → projects (warm nav; shell לא אמור להבהב)
2. Settings → טאב כללי מהיר; טאב Grow טוען webhook/onboard
3. פתיחת תקלה → drawer; professionals לא שואב את כל הטבלה
4. `node scripts/perf-nav-timing.mjs` עם `DEMO_LOGIN_EMAIL` + `DEMO_LOGIN_PASSWORD` (חובה; בלי defaults)
