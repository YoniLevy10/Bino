# מדריך סביבת עבודה — Bamakor

## איפה עובדים (חובה לכל ה-Agents)

| תיקייה | ענף | שימוש |
|--------|-----|--------|
| **`C:\Users\levyy\bamakor-dashboard-dev`** | `develop` | **כל הפיתוח** — משרד, יומן, manager parity, CI |
| `C:\Users\levyy\bamakor-dashboard` | `main` / `hotfix/*` | **פרודקשן בלבד** — merge ממוקד, לא WIP יומיומי |

פתחו ב-Cursor: **`bamakor.code-workspace`** (בתיקיית `C:\Users\levyy`) — התיקייה הראשית היא **develop**.

## מה כבר סודר (יוני 2026)

1. **WIP של manager parity** הועבר מ-`main` ל-`develop` (stash → pop).
2. **משרד + יומן + SMS clamp** מאוחדים על `develop` (מיזוג ידני ב-`ui.tsx` + `api-body-schemas.ts`).
3. **`main` נקי** — אין שם יותר עשרות קבצים לא ממומשים.
4. **Hotfix SMS** (סטטוס 019 `989` — הודעה ארוכה מדי): ענף `hotfix/sms-989-clamp` בתיקיית `main`, שינוי **רק** ב-`lib/sms.ts`.

## לפני deploy לפרודקשן (Sarah)

```text
1. בתיקיית main: ענף hotfix/sms-989-clamp → commit רק lib/sms.ts → PR ל-main → merge → Vercel production
2. לא למזג את כל develop ל-main עד שסיימתם בדיקות Preview
```

## פקודות בדיקה (תמיד ב-develop)

```bash
cd C:\Users\levyy\bamakor-dashboard-dev
npm run typecheck
npm test
```

## קבצים ששני סוכנים נגעו בהם — לא לערוך במקביל

- `app/components/ui.tsx`
- `lib/api-body-schemas.ts`
- `lib/sms.ts`

## צ'קליסטים

- `IMPROVEMENT_CHECKLIST.md` — מוצר כללי
- `IMPROVEMENT_CHECKLIST_OFFICE.md` — UI משרד/יומן

## Stash ישן על main (לא נגענו)

`stash@{0}` על main = `manager-parity: new files` — **ריק** (כבר הוחל על develop).  
אם מופיע `stash@{1}` — אותו דבר. אפשר `git stash clear` ב-main אחרי וידוא.
