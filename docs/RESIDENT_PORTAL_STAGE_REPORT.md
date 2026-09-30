# דוח התקדמות — פורטל דיירים

ענף: `cursor/resident-portal`  
תאריך: 2026-09-30

## שלב 0 — מיפוי
**יושם:** ענף מ־main, cherry-pick מידרג מ־PR #176, `docs/RESIDENT_PORTAL_STAGE0_GAPS.md`.  
**נבדק:** קיום/חוסר טבלאות portal; middleware manager-only.  
**נותר / חסימות:** אין `supabase link` בסביבה — יש להריץ מיגרציות 107–110 מול פרודקשן/סטייג׳ ולעדכן `database.types.ts`.

## שלב 1 — זהות והרשאות
**יושם:** מיגרציה 107; memberships/invites; `requireResidentContext`; middleware + auth callback; `/resident/login`, accept-invite, shell, context cookie.  
**נבדק:** unit tests לבידוד scope + crypto; `tsc --noEmit` ירוק.  
**נותר:** בדיקת OTP אמיתית מול Supabase Auth templates; Redirect URL ל־`/auth/callback?next=/resident`.

## שלב 2 — מידע וניהול
**יושם:** מיגרציה 108; APIs announcements/amenities/documents; מסכי information/home; פאנל מנהל בפרויקט; פרסום מסמכים מ־ProjectDocumentsPanel.  
**נבדק:** לוגיקת תפוגת הודעות בטסטים.  
**נותר:** קהל יעד ברמת בניין/דירה ב-UI מנהל (API תומך; ברירת מחדל = כל הפרויקט).

## שלב 3 — תשלומים
**יושם:** מיגרציה 109; `GET /api/resident/charges` whitelist; pay gate ל־`/pay/[token]`; due_date + published_to_portal; מסך payments.  
**נבדק:** לוגיקת איחור בטסטים.  
**נותר:** בדיקת Grow end-to-end בפיילוט; רגרסיית `/pay` ידנית.

## שלב 4 — תקלות ובוט
**יושם:** מיגרציה 110; `createTicketShared`; APIs tickets/chat; מסכי tickets/chat; מידרג deep-link; יצירת web form עוברת דרך השירות המשותף.  
**נבדק:** midrag unit tests (18) + portal tests.  
**נותר:** חילוץ מלא של מסלול WhatsApp ל־shared service (כרגע portal + web form); בדיקת idempotency בפרודקשן.

## שלב 5 — פיילוט
**יושם:** `docs/RESIDENT_PORTAL_PILOT.md` עם מדדים והוראות הפעלה לפרויקט אחד.  
**נבדק:** לא הופעל על לקוח אמיתי מהסביבה (אין credentials).  
**נותר:** בחירת בניין פיילוט, apply migrations, הזמנת דיירים, מדידה לפני הרחבה.

## קבצים מרכזיים
- `supabase/migrations/107–110_resident_portal_*.sql`
- `lib/resident-portal/*`, `lib/tickets/create-ticket-service.ts`, `lib/midrag/external-search.ts`
- `app/resident/**`, `app/api/resident/**`, `app/api/projects/resident-portal/**`
- `middleware.ts`, `app/auth/callback/route.ts`
