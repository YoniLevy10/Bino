# תיעוד פלטפורמה — Bamakor (פנימי)

מסמך זה מיועד לצוות Levy Tech / פיתוח. מוצג ב-Super Admin → **תיעוד**.

## סביבות ופריסה

| סביבה | ענף Git | URL |
|--------|---------|-----|
| פיתוח | `develop` | `bamakor-dashboard-dev` מקומי / Preview |
| פרודקשן | `main` | https://bamakor.vercel.app |

**פיתוח יומי:** תיקיית `bamakor-dashboard-dev`, ענף `develop`.  
**פרודקשן:** merge ממוקד ל-`main` אחרי בדיקות.

## הרשאות לשוניות (לקוחות)

| `enabled_nav_features` | משמעות |
|------------------------|--------|
| `NULL` | **לגסי · הכל** — רק ללקוח ששילם על כל הלשוניות (סופר־אדמין) |
| מערך ליבה | **חבילת הקמה (~10k)** — ברירת מחדל ללקוח חדש ולקוחות קיימים אחרי מיגרציה |
| מערך מותאם | תוספים נבחרים אחרי תשלום |

### ליבה (כלול בהקמה)

לוח בקרה, תקלות, פרויקטים, דיירים, עובדים, סיכום, QR, תבניות וואטסאפ, דיירים ממתינים (תחת דיירים), חיוב ושימוש.

### בתשלום (2 תוספים)

1. **יומן משרד** — `calendar`  
2. **שעון עובדים** — `attendance`  

לקוח רואה `/addons` עם תצוגה מקדימה + מנעול. פתיחה: סופר־אדמין → סמן לשונית → **שמור הרשאות**.

### הקמת לקוח חדש

`POST /api/admin/setup-client` (header `x-admin-secret`) — יוצר לקוח עם `enabled_nav_features` = חבילת ליבה אוטומטית.

## דפוס API (חובה)

```
1. requireSessionClientId()  → auth + clientId
2. checkAuthenticatedPostRouteLimit()
3. validate body (zod) — lib/api-body-schemas.ts
4. getSupabaseAdmin() לכתיבות
```

**אסור** לכתוב ל-`clients` / הגדרות מ-`supabase` בדפדפן — RLS עושה no-op בשקט.

## SMS (019)

- בלי אימוג'י בהודעה  
- שולח = מספר `972xxxxxxxxx` בלבד (לא שם "Bamakor") — סטטוס 515  
- 3 ניסיונות, אחר כך `failed_notifications`

## WhatsApp

- Webhook: `tenant-resolution` — כל שדה ב-webhook חייב ב-SELECT  
- הודעת מיקום: תבנית `redirect_to_text` בלבד (לא מימוש location)  
- `WHATSAPP_APP_SECRET` — עדיין חסר ב-Vercel (חתימה)

## מיגרציות רלוונטיות (045–053)

| קובץ | תוכן |
|------|------|
| 045 | נוכחות משרד |
| 046–047 | יומן |
| 048 | סדר תפריט צד |
| 049 | התראות ops (אימייל) |
| 050 | `enabled_nav_features` |
| 051–052 | חבילת הקמה + backfill לקוחות |
| 053 | פרימיום = יומן + שעון בלבד |

הרצה: `npx supabase db query --linked -f supabase/migrations/XXX.sql`

## סופר־אדמין

- `/superadmin` — קוד: `ADMIN_SETUP_SECRET` (Vercel / `.env.local`)  
- לשוניות: חבילת הקמה / סמן הכל + שמור / לגסי · כל הלשוניות  
- מחיקת לקוח: `DELETE /api/superadmin/client/[id]` — מוחק org + משתמשים, לא תקלות היסטוריות של דיירים בשדה (לפי `delete-client.ts`)

## קבצים רגישים לעריכה מקבילה

- `app/components/ui.tsx`  
- `lib/api-body-schemas.ts`  
- `lib/sms.ts`

## פקודות בדיקה

```bash
npm run typecheck
npm test
npm run build
```

## קישורים במאגר

- `docs/BILLING_PLANS.md` — תוכניות חיוב חודשיות (₪299–₪899+)  
- `WORKSPACE_GUIDE.md` — סביבת עבודה  
- `docs/RUNBOOKS.md` — תקלות נפוצות  
- `IMPROVEMENT_CHECKLIST.md` — מוצר  
- `CLAUDE.md` — כללי סוכן / Cursor
