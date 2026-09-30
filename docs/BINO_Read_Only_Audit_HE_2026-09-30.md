# BINO — דוח ביקורת בקריאה בלבד

תאריך: 30.09.2026

Repository: [YoniLevy10/Bino](https://github.com/YoniLevy10/Bino)

גרסה שנבדקה: [main — 1732e09](https://github.com/YoniLevy10/Bino/tree/1732e09a53eb28f7ac56ddcf6572d307384be4e7)

## מסקנה

[בטוח] בגרסה שנבדקה יש פערים משמעותיים באימות בקשות, הרשאות, בידוד קשרים בין לקוחות, אמינות callbacks, ניהול מצבי תשלום ונוכחות offline. אין בסיס להכריז שהמערכת נקייה מבעיות או מוכנה להרחבת גבייה על סמך CI ירוק בלבד.

נרשמו **52 ממצאים ופערים**: 26 ברמת P1, 25 ברמת P2 ו־1 ברמת P3. אלה אינם 52 תקלות שהוכחו בייצור: חלקם באגים דטרמיניסטיים בקוד, חלקם סיכונים מותנים בתצורה/עומס, וחלקם פערי מוצר או אכיפה. [בטוח] מתאר ראיה מוצקה בקוד; כאשר התוצאה בייצור תלויה בסכמה או בספק, הדבר מצוין במפורש.

## גבולות הבדיקה

- כל הפעולות מול GitHub היו פעולות קריאה. לא שונו קוד, branches, PRs, הגדרות, migrations או נתוני לקוחות. העותק הזמני נשאר ללא שינוי.
- מופו 876 קבצים, 157 נתיבי API ו־102 מיגרציות. בוצעה סקירה ממוקדת של נתיבי הכניסה, helpers של הרשאות, תשלומים, webhooks, נוכחות, מטמונים, מסמכים, סכמה ובדיקות. מיפוי קובץ אינו שקול לקריאה מלאה של כל שורה בו.
- זו ביקורת סטטית. לא הופעלו tests, builds, crons, חיובים, הודעות, דיווחים או פעולות UI שמשנות נתונים. תרחישי הבדיקה להלן הם בדיקות מוצעות, **לא בדיקות שהורצו**.
- לא נקראה הסכמה החיה ב־Supabase, לא נבדקו secrets/משתני סביבה ב־Vercel ולא נבדקו settings או עסקאות בחשבון Grow. SQL בריפו אינו הוכחה שהמיגרציה יושמה או שמסד ותיק זהה למסד חדש.
- אין הוכחה שה־commit הזה הוא גרסת production הנוכחית. לא בוצעו בדיקת שימוש מלאה, בדיקת חדירה, מדידת ביצועים או בדיקת שחזור מגיבוי.
- בזמן הסקירה נצפה [PR פתוח #177 — פורטל דיירים](https://github.com/YoniLevy10/Bino/pull/177), branch `cursor/resident-portal`. הוא אינו כלול בביקורת הקוד הזאת. שינויים שמוזגו אחרי קיבוע ה־commit אינם נכללים.

## סדר הטיפול המומלץ — ללא ביצוע שינויים

1. **דיווח ציבורי ו־callbacks:** ממצאים 01–03. להשלים בדיקות דרך middleware אמיתי.
2. **אכיפת הרשאות ובידוד:** 04–08; בדיקת תפקיד viewer, בעלות על מזהים, RLS והעוגייה הלא חתומה.
3. **שלמות כספית:** 17–22 ו־28; מצבי תשלום, סכום, concurrency, ביטול ויצירה חוזרת.
4. **אמינות WhatsApp:** 11–15; אישור רק לאחר שמירה ניתנת לשחזור, וכיסוי batch.
5. **נוכחות:** 34–39; תור פר־עובד, חלוקה לבאצוות, אירועים מאוחרים והתאמה בין event למשמרת.
6. **מחיקה ושחזור:** 40; לבדוק FK חי לפני שמסתמכים על soft delete.
7. **כיסוי בדיקות:** 48; שער שחרור שמכסה את הזרימות האמיתיות, לא רק תשובות מדומות.
8. לאחר מכן: חיפושים, pagination, מטמונים, התראות ושאר פערי P2/P3.

המספור בהמשך הוא קבוע לצורך העברה ל־Cursor. P1 = סיכון גבוה לזרימה עסקית/הרשאות/נתונים; P2 = סיכון בינוני/התאוששות/תפעול; P3 = פער קטן. לא סווג P0 כי לא אומתה פגיעה פעילה בסביבה החיה.

## מפת ממצאים

| מזהה | תחום | חומרה | ודאות הראיה | ממצא |
|---|---|---|---|---|
| 01 | כניסה, הרשאות ובידוד | P1 | [בטוח] | דיווח ציבורי נחסם לפני הגעה לשרת |
| 02 | כניסה, הרשאות ובידוד | P1 | [בטוח] | Webhook של Fixly נחסם באימות משתמש |
| 03 | כניסה, הרשאות ובידוד | P1 | [בטוח] | Webhook חתימות מסמכים נחסם באימות משתמש |
| 04 | כניסה, הרשאות ובידוד | P1 | [בטוח] | תפקיד viewer אינו מגביל כתיבה ב־API |
| 05 | כניסה, הרשאות ובידוד | P1 | [בטוח] | שיוך משימת אחזקה לפרויקט או עובד של לקוח אחר |
| 06 | כניסה, הרשאות ובידוד | P1 | [בטוח] | עדכון תקלה מאפשר worker_id בלי אימות שיוך |
| 07 | כניסה, הרשאות ובידוד | P1 | [סביר] | RLS מאפשר כתיבה ישירה ועקיפת בקרות API |
| 08 | כניסה, הרשאות ובידוד | P1 | [בטוח] | עוגיית tenant אינה חתומה וניתנת לזיוף |
| 09 | כניסה, הרשאות ובידוד | P2 | [בטוח] | השבתת ארגון או לקוח אינה נבדקת בפתרון tenant |
| 10 | כניסה, הרשאות ובידוד | P2 | [בטוח] | Superadmin משתמש בסוד גלובלי שנשמר בדפדפן |
| 11 | WhatsApp ואמינות הודעות | P1 | [בטוח] | אימות חתימת WhatsApp מותנה בקיום משתנה סביבה |
| 12 | WhatsApp ואמינות הודעות | P1 | [בטוח] | כשל טיפול או עומס מקבלים HTTP 200 |
| 13 | WhatsApp ואמינות הודעות | P1 | [בטוח] | Dedupe מסומן לפני הצלחת עיבוד ההודעה |
| 14 | WhatsApp ואמינות הודעות | P1 | [בטוח] | Webhook מטפל רק בפריט הראשון ב־batch |
| 15 | WhatsApp ואמינות הודעות | P1 | [בטוח] | שיוך WhatsApp עמום בוחר את הלקוח הראשון |
| 16 | WhatsApp ואמינות הודעות | P2 | [בטוח] | דוח תחזוקה יכול לדווח שנשלח למרות כשל שליחה |
| 17 | כסף, גבייה וחשבוניות | P1 | [בטוח] | חיוב מסומן paid ונשלח אישור לפני Approve |
| 18 | כסף, גבייה וחשבוניות | P1 | [בטוח] | שגיאות DB ב־callback תשלום נבלעות |
| 19 | כסף, גבייה וחשבוניות | P1 | [בטוח] | דחיית סכום אינה עוצרת שיוך מזהי עסקה ואישור |
| 20 | כסף, גבייה וחשבוניות | P1 | [בטוח] | פעולת שליחה יכולה לדרוס paid/cancelled שהשתנו בינתיים |
| 21 | כסף, גבייה וחשבוניות | P1 | [סביר] | ניתן ליצור כמה מסלולי תשלום לאותו חיוב פתוח |
| 22 | כסף, גבייה וחשבוניות | P1 | [סביר] | ביטול מקומי אינו מבטל קישור שכבר נפתח ב־Grow |
| 23 | כסף, גבייה וחשבוניות | P2 | [בטוח] | Resend מאפשר SMS לחיוב ששולם אם יש URL |
| 24 | כסף, גבייה וחשבוניות | P2 | [בטוח] | חשבונית עם customFields.cField1 אינה מתאימה לפי token |
| 25 | כסף, גבייה וחשבוניות | P2 | [בטוח] | שליחת אישור/חשבונית אינה idempotent מול בקשות מקבילות |
| 26 | כסף, גבייה וחשבוניות | P2 | [סביר] | אין מסלול התאוששות אמין לשליחת אישור/חשבונית שנכשלה |
| 27 | כסף, גבייה וחשבוניות | P2 | [בטוח] | טלפון לקבלה נשמר אך אינו משמש לשליחת חשבונית ב־BINO |
| 28 | כסף, גבייה וחשבוניות | P1 | [בטוח] | יצירת חיובים יחידים ומרוכזים חסרה idempotency |
| 29 | כסף, גבייה וחשבוניות | P2 | [סביר] | שליחת 500 חיובים נעשית בלולאה סינכרונית אחת |
| 30 | כסף, גבייה וחשבוניות | P2 | [בטוח] | חיפוש חיובים מסנן רק את העמוד שכבר נטען |
| 31 | כסף, גבייה וחשבוניות | P2 | [סביר] | סיכומי כסף ומחיקת כל התקלות אינם מבצעים pagination |
| 32 | כסף, גבייה וחשבוניות | P2 | [בטוח] | Retry Approve מאבד את סוג העסקה המקורי |
| 33 | כסף, גבייה וחשבוניות | P2 | [בטוח] | משתנה Grow חסר או שגוי בוחר production |
| 34 | עובדים, NFC ועבודה ללא רשת | P1 | [בטוח] | תור נוכחות אינו מופרד לפי עובד |
| 35 | עובדים, NFC ועבודה ללא רשת | P1 | [בטוח] | תור עם יותר מ־50 אירועים אינו יכול להסתנכרן |
| 36 | עובדים, NFC ועבודה ללא רשת | P1 | [בטוח] | סנכרון בוחר כניסה/יציאה לפי מצב השרת במקום כוונת האירוע |
| 37 | עובדים, NFC ועבודה ללא רשת | P1 | [בטוח] | אירוע יכול להיות synced אף שעדכון המשמרת נכשל |
| 38 | עובדים, NFC ועבודה ללא רשת | P2 | [בטוח] | אפשר לדלג על בדיקת geofence בהשמטת קואורדינטות |
| 39 | עובדים, NFC ועבודה ללא רשת | P2 | [בטוח] | דיווח ליקוי מסיור יוצר תקלה לפני אימות קובץ |
| 40 | נתונים, ביצועים וממשק | P1 | [בטוח] | מחיקת פרויקט סותרת את הצהרת המחיקה הרכה |
| 41 | נתונים, ביצועים וממשק | P2 | [בטוח] | Query key משותף לרשימות של 50 ושל 200 תקלות |
| 42 | נתונים, ביצועים וממשק | P2 | [סביר] | ניקוי מטמון בהחלפת משתמש אינו מנקה React Query |
| 43 | נתונים, ביצועים וממשק | P2 | [בטוח] | חיפוש בניינים מתבצע רק מתוך 80 הראשונים |
| 44 | נתונים, ביצועים וממשק | P2 | [בטוח] | רשימת משימות וספירת משימות פתוחות נחתכות ב־300 |
| 45 | נתונים, ביצועים וממשק | P2 | [בטוח] | Pagination דיירים אינו בעל סדר יציב |
| 46 | נתונים, ביצועים וממשק | P3 | [בטוח] | התרעת תקלות אומרת 300 בעוד limit בפועל 200 |
| 47 | נתונים, ביצועים וממשק | P2 | [בטוח] | Multipart עוקף מגבלות טקסט שנבדקות ב־JSON |
| 48 | תפעול, בדיקות ומוכנות | P1 | [בטוח] | CI ירוק אינו בודק את זרימת הדיווח הציבורי האמיתית |
| 49 | תפעול, בדיקות ומוכנות | P2 | [בטוח] | Cron תחזוקה מונעת אינו מתוזמן ב־vercel.json |
| 50 | תפעול, בדיקות ומוכנות | P2 | [בטוח] | Rate limit נכשל למצב שמאפשר את הבקשה |
| 51 | תפעול, בדיקות ומוכנות | P2 | [בטוח] | חתימה דיגיטלית היא כרגע תיעוד וקישור ידני |
| 52 | תפעול, בדיקות ומוכנות | P2 | [בטוח] | כיבוי addon בקטלוג אינו נבדק בהרשאת שימוש |

## כניסה, הרשאות ובידוד

### 01. דיווח ציבורי נחסם לפני הגעה לשרת

**P1 · [בטוח]**

**ראיה:** `/report` ציבורי, אך `/api/create-ticket` אינו ברשימת החריגים ב־middleware. הטופס פונה לנתיב הזה. בקשה ללא session מגיעה לענף שמחזיר 401 לפני handler שמאפשר client_id ציבורי.

**השפעה:** דייר שסורק QR ופותח דיווח ללא התחברות אינו יכול להשלים דיווח בגרסה זו.

**בדיקת סגירה מוצעת:** בסביבת בדיקה: פתח /report עם client ו־project בחלון פרטי ושלח טופס; בדוק 401. לא בוצעה שליחה בביקורת.

**מיקום בקוד:**

- [middleware.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/middleware.ts)
- [app/report/page.tsx](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/app/report/page.tsx)
- [app/api/create-ticket/route.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/app/api/create-ticket/route.ts)

### 02. Webhook של Fixly נחסם באימות משתמש

**P1 · [בטוח]**

**ראיה:** רשימת החריגים מכילה WhatsApp ו־Grow, אך לא /api/webhook/fixly. הסוד x-webhook-token שב־handler אינו פוטר מה־middleware.

**השפעה:** עדכוני בעל מקצוע וסטטוס מ־Fixly אינם מגיעים למימוש עבור callback בלי Supabase session.

**בדיקת סגירה מוצעת:** בדיקת middleware או callback מסונתז בסביבה מבודדת, ללא cookie ועם סוד בדיקה.

**מיקום בקוד:**

- [middleware.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/middleware.ts)
- [app/api/webhook/fixly/route.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/app/api/webhook/fixly/route.ts)

### 03. Webhook חתימות מסמכים נחסם באימות משתמש

**P1 · [בטוח]**

**ראיה:** גם /api/webhook/document-sign אינו מוחרג. ה־handler מצפה ל־Bearer של ספק חתימה, אך ה־middleware דורש session קודם.

**השפעה:** סטטוס חתימה אינו מתעדכן גם כאשר הספק שולח את הסוד שה־handler דורש.

**בדיקת סגירה מוצעת:** בדיקת middleware ללא session עם Authorization של ספק בדיקה.

**מיקום בקוד:**

- [middleware.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/middleware.ts)
- [app/api/webhook/document-sign/route.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/app/api/webhook/document-sign/route.ts)

### 04. תפקיד viewer אינו מגביל כתיבה ב־API

**P1 · [בטוח]**

**ראיה:** הסכמה מגדירה admin/manager/viewer; requireSessionClientId מחזיר userId, clientId ו־admin בלי לבדוק role. פעולות מחיקה, שינוי הגדרות וסימון תשלום ידני מסתפקות ב־helper הזה או בבדיקת תוסף.

**השפעה:** חבר ארגון בתפקיד צפייה יכול להגיע לפעולות רגישות באמצעות API. הסתרת כפתורים אינה אוכפת תפקיד.

**בדיקת סגירה מוצעת:** בסביבה מבודדת, השווה הרשאות viewer ו־admin בפעולות מחיקה/הגדרות/סימון שולם.

**מיקום בקוד:**

- [lib/api-auth.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/lib/api-auth.ts)
- [lib/require-paid-addon.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/lib/require-paid-addon.ts)
- [app/api/tickets/delete/route.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/app/api/tickets/delete/route.ts)
- [app/api/settings/update/route.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/app/api/settings/update/route.ts)
- [supabase/migrations/018_01_organizations.sql](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/supabase/migrations/018_01_organizations.sql)

### 05. שיוך משימת אחזקה לפרויקט או עובד של לקוח אחר

**P1 · [בטוח]**

**ראיה:** POST ו־PATCH מעבירים project_id ו־assigned_worker_id ל־service role ללא אימות בעלות של הרשומות. המיגרציה מגדירה FK לפי id בלבד, בלי client_id משותף.

**השפעה:** ניתן ליצור קשר בין משימה של לקוח א׳ לפרויקט/עובד של לקוח ב׳. TASK_SELECT מחזיר גם שמות הרשומות המקושרות. החשיפה תלויה בידיעת המזהים ובסכמה בפועל.

**בדיקת סגירה מוצעת:** שני tenants בדיקה: נסה ליצור משימה תחת א׳ עם project_id/worker_id של ב׳; בדוק חסימה ורשומות חוזרות.

**מיקום בקוד:**

- [app/api/maintenance-tasks/route.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/app/api/maintenance-tasks/route.ts)
- [supabase/migrations/105_maintenance_tasks_formly_worker_prefs.sql](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/supabase/migrations/105_maintenance_tasks_formly_worker_prefs.sql)

### 06. עדכון תקלה מאפשר worker_id בלי אימות שיוך

**P1 · [בטוח]**

**ראיה:** assigned_worker_id מועתק ל־updatePayload בלי בדיקה שהעובד שייך ללקוח, פעיל ולא מחוק. התקלה עצמה כן מסוננת לפי client_id.

**השפעה:** שיוך שגוי יכול להעלים תקלה מפורטל העובד הנכון או לקשר עובד זר. UUID תקין אינו הוכחת בעלות.

**בדיקת סגירה מוצעת:** בדיקה מבודדת של עובד זר, עובד מושבת ועובד מחוק מול update-ticket.

**מיקום בקוד:**

- [app/api/update-ticket/route.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/app/api/update-ticket/route.ts)
- [lib/api-body-schemas.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/lib/api-body-schemas.ts)

### 07. RLS מאפשר כתיבה ישירה ועקיפת בקרות API

**P1 · [סביר]**

**ראיה:** מדיניות FOR ALL ניתנת לחברי tenant בטבלאות ליבה ונוכחות; היא בודקת client_id בלי role, מכסה, תוסף או מעברי סטטוס. אין בקרות כאלה בגוף המדיניות. הרשאות GRANT והסכמה החיה לא נבדקו.

**השפעה:** אם authenticated מחזיק בהרשאות כתיבה, ניתן לעקוף rate limit, quota, תפקידים ותהליך נוכחות באמצעות PostgREST. גם API שמסרב למשתמש רב־לקוחות אינו משנה את רשימת הלקוחות שמחזיר RLS.

**בדיקת סגירה מוצעת:** קרא GRANT ו־pg_policies בסביבה החיה; בסביבה מבודדת השווה כתיבה ישירה כ־viewer לכתיבה דרך API.

**מיקום בקוד:**

- [supabase/migrations/028_authenticated_tenant_rls.sql](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/supabase/migrations/028_authenticated_tenant_rls.sql)
- [supabase/migrations/070_worker_attendance_nfc.sql](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/supabase/migrations/070_worker_attendance_nfc.sql)
- [lib/plan-quota-check.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/lib/plan-quota-check.ts)

### 08. עוגיית tenant אינה חתומה וניתנת לזיוף

**P1 · [בטוח]**

**ראיה:** העוגייה היא JSON בקידוד base64url ללא חתימה. readMiddlewareTenantCache מאמת uid מול משתמש מחובר בלבד ומקבל clientId/feature list/ts מהלקוח. timestamp עתידי אינו נפסל.

**השפעה:** משתמש מחובר יכול לזייף את מידע ההרשאות שמשמש את ה־middleware, כולל enabledNavFeatures. אין כאן הוכחה לבדה לקריאת נתוני tenant זר: API/RLS עשויים עדיין לחסום.

**בדיקת סגירה מוצעת:** בדיקת יחידה עם עוגייה מזויפת עבור uid אמיתי, features מורחבים ו־timestamp עתידי.

**מיקום בקוד:**

- [lib/middleware-tenant-cache.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/lib/middleware-tenant-cache.ts)
- [middleware.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/middleware.ts)

### 09. השבתת ארגון או לקוח אינה נבדקת בפתרון tenant

**P2 · [בטוח]**

**ראיה:** listClientIdsForUserId קורא organization_id/client_id בלי is_active. requireSessionClientId אינו בודק clients.is_active.

**השפעה:** אם ההשבתה נעשית רק באמצעות הדגלים, משתמש קיים יכול להמשיך להגיע ל־API. אין טענה שנעשה שימוש בפועל בדגלים אלה להשבתה.

**בדיקת סגירה מוצעת:** השבת ארגון/לקוח בדיקה תוך השארת החברות, ובדוק את כל מסלולי הכניסה.

**מיקום בקוד:**

- [lib/tenant-resolution.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/lib/tenant-resolution.ts)
- [lib/api-auth.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/lib/api-auth.ts)
- [supabase/migrations/000_initial_core_schema.sql](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/supabase/migrations/000_initial_core_schema.sql)
- [supabase/migrations/018_01_organizations.sql](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/supabase/migrations/018_01_organizations.sql)

### 10. Superadmin משתמש בסוד גלובלי שנשמר בדפדפן

**P2 · [בטוח]**

**ראיה:** אימות נעשה רק מול ADMIN_SETUP_SECRET. אפשר לשמור אותו ב־localStorage באמצעות remember; אין ב־helper זהות מנהל, תוקף session או MFA.

**השפעה:** פער תכנוני: גניבת הסוד מאפשרת שימוש רחב ב־superadmin, ואין בידול או ביטול אישי של מנהלים. לא נמצאה בבדיקה הוכחה לגניבה או לסוד חשוף בריפו.

**בדיקת סגירה מוצעת:** סקירת מודל הרשאות, יכולת ביטול משתמש, תפוגה ורישום actor עבור פעולות superadmin.

**מיקום בקוד:**

- [lib/superadmin-auth.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/lib/superadmin-auth.ts)
- [lib/admin-secret-session.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/lib/admin-secret-session.ts)

## WhatsApp ואמינות הודעות

### 11. אימות חתימת WhatsApp מותנה בקיום משתנה סביבה

**P1 · [בטוח]**

**ראיה:** האימות רץ רק כאשר metaSecret אינו ריק: if (metaSecret && !verify...). כאשר WHATSAPP_APP_SECRET חסר, ה־route ממשיך לעבד.

**השפעה:** פער fail-open מוכח בקוד; הסיכון בסביבה החיה מותנה בכך שהסוד חסר. לא בדקתי ערכי environment.

**בדיקת סגירה מוצעת:** בדיקת יחידה ללא WHATSAPP_APP_SECRET ועם חתימה חסרה/שגויה; בסביבה החיה בדיקת עצם קיום המשתנה בלבד.

**מיקום בקוד:**

- [app/api/webhook/whatsapp/route.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/app/api/webhook/whatsapp/route.ts)
- [lib/whatsapp-meta-signature.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/lib/whatsapp-meta-signature.ts)

### 12. כשל טיפול או עומס מקבלים HTTP 200

**P1 · [בטוח]**

**ראיה:** אתחול DB שנכשל, tenant שלא נמצא, חריגה כללית ו־rate limit מחזירים received:true עם 200. גם dispatch-inbound תופס חריגה בסוף ואינו מעביר כשל למעלה.

**השפעה:** השרת מאשר הודעה שלא בהכרח נשמרה/עובדה. בלי תור durable אין למערכת מנגנון שחזור שמובטח במסלול הזה.

**בדיקת סגירה מוצעת:** הזרק כשל DB וחריגת dispatch בסביבה מבודדת; בדוק האם האירוע נשמר כמשימה ניתנת לשחזור לפני אישורו.

**מיקום בקוד:**

- [app/api/webhook/whatsapp/route.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/app/api/webhook/whatsapp/route.ts)
- [lib/whatsapp-webhook/dispatch-inbound.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/lib/whatsapp-webhook/dispatch-inbound.ts)

### 13. Dedupe מסומן לפני הצלחת עיבוד ההודעה

**P1 · [בטוח]**

**ראיה:** processed_webhooks מקבל insert לפני runWhatsAppInboundBackground. כפילות מוחזרת כ־200 ללא עיבוד. אין מחיקת סימון או מצב processing/failed במסלול הכשל.

**השפעה:** אם העיבוד נכשל אחרי הסימון, retry של אותה הודעה נחשב לכפילות וההודעה עלולה להישאר לא מטופלת.

**בדיקת סגירה מוצעת:** גרום לכשל אחרי insert של processed_webhooks ושלח מחדש את אותו message_id בסביבת בדיקה.

**מיקום בקוד:**

- [app/api/webhook/whatsapp/route.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/app/api/webhook/whatsapp/route.ts)

### 14. Webhook מטפל רק בפריט הראשון ב־batch

**P1 · [בטוח]**

**ראיה:** extractWhatsAppPhoneNumberId ו־parseIncomingWhatsAppMessage קוראים entry[0], changes[0], messages[0]. ה־route קורא פעם אחת ל־parser ומאשר את כל הבקשה.

**השפעה:** אם מתקבל payload עם יותר מהודעה אחת, הודעות נוספות אינן מעובדות במסלול זה.

**בדיקת סגירה מוצעת:** בדיקת parser/handler עם שני entries, שני changes ושני messages.

**מיקום בקוד:**

- [lib/whatsapp-parser.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/lib/whatsapp-parser.ts)
- [app/api/webhook/whatsapp/route.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/app/api/webhook/whatsapp/route.ts)

### 15. שיוך WhatsApp עמום בוחר את הלקוח הראשון

**P1 · [בטוח]**

**ראיה:** השאילתה limit(2), וכאשר מתקבלות שתי רשומות היא מדפיסה warning אך ממשיכה rows[0]. לא נמצאה במיגרציות שנבדקו הגדרת uniqueness על clients.whatsapp_phone_number_id.

**השפעה:** במצב של מספר Meta המשויך ליותר מלקוח, הודעה עלולה לעבור לטננט לא נכון. לא אומתה כפילות בסביבה החיה.

**בדיקת סגירה מוצעת:** קריאה בלבד: בדיקת כפילויות בשדה ובדיקת constraint בסכמה; בדיקת resolver עם שתי רשומות.

**מיקום בקוד:**

- [lib/tenant-resolution.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/lib/tenant-resolution.ts)

### 16. דוח תחזוקה יכול לדווח שנשלח למרות כשל שליחה

**P2 · [בטוח]**

**ראיה:** ה־cron קובע sent=true אחרי await sendWhatsAppTextMessage בלי לבדוק result; הפונקציה מחזירה null בכשל. גם SMS מחזיר boolean שנזרק.

**השפעה:** fallback ל־SMS יכול לא לרוץ אחרי כשל WhatsApp, ו־reportsSent עלול להיות שגוי.

**בדיקת סגירה מוצעת:** בדיקת cron עם WhatsApp שמחזיר null ו־SMS שמחזיר false.

**מיקום בקוד:**

- [app/api/cron/preventive-maintenance/route.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/app/api/cron/preventive-maintenance/route.ts)
- [lib/whatsapp-send.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/lib/whatsapp-send.ts)
- [lib/sms-send.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/lib/sms-send.ts)

## כסף, גבייה וחשבוניות

### 17. חיוב מסומן paid ונשלח אישור לפני Approve

**P1 · [בטוח]**

**ראיה:** markChargePaidByGrowIds נקרא לפני approveGrowTransaction; הוא גם מפעיל שליחת אישור תשלום. במקרה כשל Approve הקוד משאיר paid לצורך retry.

**השפעה:** המערכת מציגה שולם גם כששלב האישור נכשל. המשמעות הכספית של Approve חייבת אימות מול Grow; סדר הפעולות ומצב paid מוכחים בקוד.

**בדיקת סגירה מוצעת:** בדיקת failure של Approve והשוואת סטטוס החיוב והאישור שנשלח; אימות משמעות שלב זה מול תיעוד/נציג Grow.

**מיקום בקוד:**

- [app/api/webhook/grow/route.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/app/api/webhook/grow/route.ts)
- [lib/collection-charge-ops.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/lib/collection-charge-ops.ts)

### 18. שגיאות DB ב־callback תשלום נבלעות

**P1 · [בטוח]**

**ראיה:** applyPaid/findChargeIdsByGrowIds קוראים data בלי לבדוק error; persistGrowTransactionIds ו־recordGrowApproveResult אינם בודקים error; גם שמירת החשבונית אינה בודקת תוצאת update.

**השפעה:** Callback עשוי לקבל 200 בזמן שהחיוב, מזהי העסקה או החשבונית לא נשמרו. retry חיצוני אינו מתבקש במסלול זה.

**בדיקת סגירה מוצעת:** הזרק שגיאות select/update לכל שלב ואמת שהתגובה משקפת כשל או שהאירוע נשמר לשחזור.

**מיקום בקוד:**

- [lib/collection-charge-ops.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/lib/collection-charge-ops.ts)
- [app/api/webhook/grow/route.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/app/api/webhook/grow/route.ts)
- [app/api/webhook/grow-invoice/route.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/app/api/webhook/grow-invoice/route.ts)

### 19. דחיית סכום אינה עוצרת שיוך מזהי עסקה ואישור

**P1 · [בטוח]**

**ראיה:** לאחר sumRejected, ה־route פותר chargeIds מחדש ללא בדיקת סכום ומשתמש בהם ל־persistGrowTransactionIds ול־recordGrowApproveResult. Approve נקרא כאשר יש transactionId/token גם אם אין חיובים מאושרים.

**השפעה:** עסקה עם סכום שגוי יכולה להתקשר לחיוב שנדחה; חשבונית בהמשך עשויה להתאים לפי transaction_id זה. paid עצמו כן מוגן בבדיקת סכום כאשר הסכום קיים.

**בדיקת סגירה מוצעת:** Callback בדיקה עם מזהה חיוב נכון וסכום שגוי; בדוק שכל שדות העסקה נשארים ללא שינוי ושאין Approve.

**מיקום בקוד:**

- [app/api/webhook/grow/route.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/app/api/webhook/grow/route.ts)
- [lib/collection-charge-ops.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/lib/collection-charge-ops.ts)

### 20. פעולת שליחה יכולה לדרוס paid/cancelled שהשתנו בינתיים

**P1 · [בטוח]**

**ראיה:** sendCollectionCharge בודק status מתוך snapshot ואז עושה update ל־sent ללא תנאי status. מסלול wallet עושה update לפי snapshot דומה. cancel ו־manual-paid גם קוראים ואז כותבים בלי מצב צפוי.

**השפעה:** תשלום בזמן שה־SMS/יצירת session ממתינים עלול להידרס חזרה ל־sent; ביטול ותשלום יכולים לדרוס זה את זה.

**בדיקת סגירה מוצעת:** בדיקות מרוץ מבודדות: callback paid בין קריאת החיוב לעדכון השליחה/wallet/cancel.

**מיקום בקוד:**

- [lib/collection-charge-ops.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/lib/collection-charge-ops.ts)
- [app/api/public/pay/[token]/wallet/route.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/app/api/public/pay/%5Btoken%5D/wallet/route.ts)

### 21. ניתן ליצור כמה מסלולי תשלום לאותו חיוב פתוח

**P1 · [סביר]**

**ראיה:** כל POST wallet יוצר createPaymentProcess חדש ושומר process_id יחיד. אין lock/מפתח idempotency משותף בין wallet לבין payment link. cField1 משותף עוזר לשיוך callbacks אך אינו מנעול חיוב.

**השפעה:** שני טאבים או לחיצות מקבילות עשויים להציג שתי עסקאות פעילות. גבייה כפולה בפועל תלויה בהגנות Grow ולא אומתה.

**בדיקת סגירה מוצעת:** בסנדבוקס בלבד: פתיחת שני wallets וקישור תשלום לאותו חיוב, ובדיקת ההגנה מפני תשלום שני.

**מיקום בקוד:**

- [app/api/public/pay/[token]/wallet/route.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/app/api/public/pay/%5Btoken%5D/wallet/route.ts)
- [lib/collection-charge-ops.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/lib/collection-charge-ops.ts)

### 22. ביטול מקומי אינו מבטל קישור שכבר נפתח ב־Grow

**P1 · [סביר]**

**ראיה:** cancelCollectionCharge מחליף public_token ומוחק payment_url מקומי, אך אינו מבצע בקשת ביטול ל־Grow. ה־link id נשאר כדי להתאים callback מאוחר; callback יכול לסמן גם cancelled כ־paid.

**השפעה:** קישור Grow שכבר נפתח/הועתק עשוי להישאר ניתן לתשלום. לא נבדקה יכולת הביטול או תוקף הקישור אצל הספק.

**בדיקת סגירה מוצעת:** בדיקת סנדבוקס: פתח קישור Grow, בטל ב־BINO, ובדוק שהספק מסרב לתשלום נוסף.

**מיקום בקוד:**

- [lib/collection-charge-ops.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/lib/collection-charge-ops.ts)

### 23. Resend מאפשר SMS לחיוב ששולם אם יש URL

**P2 · [בטוח]**

**ראיה:** בדיקת paid/cancelled ב־resendCollectionChargeSms נמצאת בתוך תנאי המחייב היעדר payment URLs. חיוב paid ששומר URL מדלג על החסימה.

**השפעה:** דייר עלול לקבל שוב דרישת תשלום שכבר שולמה. קישור BINO עצמו לא מאפשר תשלום כאשר status=paid, אך המסר עדיין שגוי.

**בדיקת סגירה מוצעת:** בדיקת helper עם status=paid ו־grow_payment_url לא ריק.

**מיקום בקוד:**

- [lib/collection-charge-ops.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/lib/collection-charge-ops.ts)

### 24. חשבונית עם customFields.cField1 אינה מתאימה לפי token

**P2 · [בטוח]**

**ראיה:** Webhook תשלום משטח customFields לתוך root; invoice webhook משטח data בלבד וקורא cField1 ישירות. כאשר token נמצא ב־data.customFields ואין מזהה חלופי מוכר, chargeIds ריק.

**השפעה:** חשבונית יכולה לקבל matched:0 ולהיעלם מהחיוב. נדרש payload מקורי של Grow כדי לאמת שהפורמט הזה מופיע בפועל.

**בדיקת סגירה מוצעת:** בדיקת invoice webhook עם data.customFields.cField1 וללא processId/transactionId.

**מיקום בקוד:**

- [app/api/webhook/grow-invoice/route.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/app/api/webhook/grow-invoice/route.ts)
- [lib/grow-webhook.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/lib/grow-webhook.ts)

### 25. שליחת אישור/חשבונית אינה idempotent מול בקשות מקבילות

**P2 · [בטוח]**

**ראיה:** שני helpers קוראים sent_at, שולחים ואז מעדכנים sent_at. תנאי null בעדכון נעשה אחרי השליחה. לא נשלח מפתח idempotency ל־Resend.

**השפעה:** שני callbacks מקבילים או כשל שמירת sent_at לאחר שליחה יכולים לגרום למיילים כפולים.

**בדיקת סגירה מוצעת:** הרץ שני helpers במקביל עם sent_at=null בסביבה מבודדת ובדוק מספר שליחות.

**מיקום בקוד:**

- [lib/collection-invoice-email.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/lib/collection-invoice-email.ts)
- [lib/collection-receipt-email.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/lib/collection-receipt-email.ts)
- [lib/email-resend.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/lib/email-resend.ts)

### 26. אין מסלול התאוששות אמין לשליחת אישור/חשבונית שנכשלה

**P2 · [סביר]**

**ראיה:** אישורי תשלום מופעלים בחלק מהמסלולים באמצעות void promise עם catch ריק. חשבונית מחזירה 200 גם כש־email result הוא error. לא נמצא cron ייעודי או תור retry לחשבוניות/אישורי תשלום.

**השפעה:** החיוב עשוי להישמר כ־paid בלי שהדייר יקבל מסמך. void promise אינו מבטיח השלמה אחרי תשובת פונקציה.

**בדיקת סגירה מוצעת:** כשל Resend/סיום פונקציה לאחר תגובה; בדוק אם יש רשומת retry שנשמרת ונשלחת בהמשך.

**מיקום בקוד:**

- [lib/collection-charge-ops.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/lib/collection-charge-ops.ts)
- [app/api/public/pay/[token]/route.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/app/api/public/pay/%5Btoken%5D/route.ts)
- [app/api/webhook/grow-invoice/route.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/app/api/webhook/grow-invoice/route.ts)
- [vercel.json](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/vercel.json)

### 27. טלפון לקבלה נשמר אך אינו משמש לשליחת חשבונית ב־BINO

**P2 · [בטוח]**

**ראיה:** receipt_phone נשמר; sender החשבונית משתמש באימייל בלבד. לא נמצא sender חשבונית ב־SMS. שינוי פרטי קשר מאוחר מפעיל receipt email, ולא invoice email.

**השפעה:** אין במימוש BINO שנבדק השלמה לדרישה לשלוח חשבונית אוטומטית ב־SMS. ייתכן ש־Grow שולח בנפרד, אך זה לא אומת.

**בדיקת סגירה מוצעת:** קבל callback חשבונית ללא email ועם receipt_phone; בדוק delivery אצל BINO ובחשבון Grow.

**מיקום בקוד:**

- [app/api/public/pay/[token]/route.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/app/api/public/pay/%5Btoken%5D/route.ts)
- [lib/collection-invoice-email.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/lib/collection-invoice-email.ts)

### 28. יצירת חיובים יחידים ומרוכזים חסרה idempotency

**P1 · [בטוח]**

**ראיה:** כל POST יוצר רשומה חדשה; batchId נוצר מחדש בכל בקשה. items מאפשר כמה פריטים עם אותו resident_id ואין בדיקת ייחוד/מפתח פעולה.

**השפעה:** Retry אחרי timeout או double click יכול ליצור חיובים כפולים; duplicate item בבקשה אחת יוצר כמה חיובים לדייר. חיובים עסקיים נוספים לאותה תקופה יכולים להיות לגיטימיים — נדרש מפתח פעולה, לא איסור גורף.

**בדיקת סגירה מוצעת:** בסביבה מבודדת שלח אותה פעולה פעמיים ו־batch עם duplicate resident_id.

**מיקום בקוד:**

- [app/api/collections/charges/route.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/app/api/collections/charges/route.ts)
- [app/api/collections/charges/bulk-send/route.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/app/api/collections/charges/bulk-send/route.ts)
- [lib/api-body-schemas.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/lib/api-body-schemas.ts)

### 29. שליחת 500 חיובים נעשית בלולאה סינכרונית אחת

**P2 · [סביר]**

**ראיה:** הסכמה מאפשרת 500 items. לכל דייר מבוצעים insert, בקשת Grow, SMS ועדכון, בזה אחר זה, לפני תשובה; אין job durable או resume.

**השפעה:** באצווה גדולה/איטיות ספק צפוי timeout ותוצאה חלקית. retry עלול להוסיף כפילויות לפי הממצא הקודם. לא נמדדה מגבלת runtime חיה.

**בדיקת סגירה מוצעת:** בדיקת עומס עם ספקים מדומים בעיכוב של שנייה ויותר לכל חיוב; בדיקת התאוששות מאמצע batch.

**מיקום בקוד:**

- [app/api/collections/charges/bulk-send/route.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/app/api/collections/charges/bulk-send/route.ts)
- [lib/api-body-schemas.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/lib/api-body-schemas.ts)
- [lib/collection-charge-ops.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/lib/collection-charge-ops.ts)

### 30. חיפוש חיובים מסנן רק את העמוד שכבר נטען

**P2 · [בטוח]**

**ראיה:** range מתבצע במסד; לאחריו q מסנן items ב־JavaScript. count אינו מתוקן לחיפוש.

**השפעה:** חיפוש יכול להחזיר עמוד ריק כשיש תוצאה בעמוד הבא, ומספר התוצאות אינו תואם למסנן.

**בדיקת סגירה מוצעת:** דייר שתוצאתו רק בעמוד שני: חפש אותו בעמוד הראשון.

**מיקום בקוד:**

- [app/api/collections/charges/route.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/app/api/collections/charges/route.ts)

### 31. סיכומי כסף ומחיקת כל התקלות אינם מבצעים pagination

**P2 · [סביר]**

**ראיה:** summary מסכם שורות שהוחזרו מ־select בלי aggregate/RPC/pagination; delete_all בונה רשימת ids מ־select יחיד ללא pagination.

**השפעה:** אם כמות הרשומות עולה על מגבלת התשובה של Data API, סיכום הגבייה יהיה חלקי ו־delete_all ימחוק רק חלק. מגבלת הסביבה החיה לא נבדקה.

**בדיקת סגירה מוצעת:** קרא את מגבלת API, והשווה totals ל־SQL COUNT/SUM בסביבה גדולה; בדיקת delete_all מבודדת.

**מיקום בקוד:**

- [app/api/collections/summary/route.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/app/api/collections/summary/route.ts)
- [lib/ticket-soft-delete.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/lib/ticket-soft-delete.ts)

### 32. Retry Approve מאבד את סוג העסקה המקורי

**P2 · [בטוח]**

**ראיה:** callback מעביר transactionTypeId/paymentType; retry שומר/קורא רק id/token ושולח defaults '1'/'2'. השדות המקוריים אינם נשמרים במסלול זה.

**השפעה:** עסקה שאינה תואמת לברירות המחדל עשויה להיכשל שוב או להישלח לספק עם סוג שגוי. הצורך המדויק בשדות דורש אימות Grow.

**בדיקת סגירה מוצעת:** בדיקת retry לעסקה שבה types שונים מ־defaults, מול fixtures מקוריים של ספק.

**מיקום בקוד:**

- [app/api/collections/charges/retry-approve/route.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/app/api/collections/charges/retry-approve/route.ts)
- [app/api/webhook/grow/route.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/app/api/webhook/grow/route.ts)
- [lib/grow-client.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/lib/grow-client.ts)

### 33. משתנה Grow חסר או שגוי בוחר production

**P2 · [בטוח]**

**ראיה:** parseGrowEnv מחזיר sandbox רק עבור המחרוזת המדויקת sandbox; כל ערך אחר, כולל ריק או שגיאת כתיב, מחזיר production.

**השפעה:** פער תצורה: סביבת בדיקה עם מפתחות מתאימים יכולה לפנות לכתובת Live בלי בחירה מפורשת. לא נטען שהדבר קרה.

**בדיקת סגירה מוצעת:** בדיקת config עם GROW_ENV חסר, Sandbox וערך שגוי; אימות סביבת כל deployment.

**מיקום בקוד:**

- [lib/grow-config.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/lib/grow-config.ts)

## עובדים, NFC ועבודה ללא רשת

### 34. תור נוכחות אינו מופרד לפי עובד

**P1 · [בטוח]**

**ראיה:** PendingAttendanceEvent אינו מכיל worker_id/client_id. getPendingAttendanceEvents מחזיר את כל התור, sync שולח אותו עם token יחיד, ו־clearWorkerToken אינו מנקה את תור IndexedDB.

**השפעה:** במכשיר משותף/החלפת עובד, אירועי עובד א׳ יכולים להישלח בשם עובד ב׳. תג מאותו לקוח יכול לעבור את בדיקת השרת.

**בדיקת סגירה מוצעת:** שני עובדים באותו tenant: צבור אירוע offline כא׳, החלף לב׳ וסנכרן בסביבת בדיקה.

**מיקום בקוד:**

- [lib/attendance-types.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/lib/attendance-types.ts)
- [lib/offline-attendance-db.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/lib/offline-attendance-db.ts)
- [lib/sync-attendance.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/lib/sync-attendance.ts)
- [lib/worker-portal-storage.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/lib/worker-portal-storage.ts)

### 35. תור עם יותר מ־50 אירועים אינו יכול להסתנכרן

**P1 · [בטוח]**

**ראיה:** הלקוח שולח את כל pending כ־events בבקשה אחת; workerAttendanceSyncBodySchema מגביל events ל־50. אין חלוקה לבאצוות.

**השפעה:** 51 אירועים גורמים לדחיית כל הבקשה, והלקוח משאיר אותם failed ושולח שוב אותו מערך גדול.

**בדיקת סגירה מוצעת:** בדיקת sync עם 51 אירועים ועם 100 אירועים.

**מיקום בקוד:**

- [lib/sync-attendance.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/lib/sync-attendance.ts)
- [lib/api-body-schemas.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/lib/api-body-schemas.ts)

### 36. סנכרון בוחר כניסה/יציאה לפי מצב השרת במקום כוונת האירוע

**P1 · [בטוח]**

**ראיה:** resolveEventTypeForTag מחזיר clock_out אם יש משמרת פתוחה ו־clock_in אחרת, ומתעלם מ־tagType. event_type_mismatch נרשם כטקסט אך אינו משנה sync_status.

**השפעה:** אירוע חוזר/מאוחר של כניסה יכול לסגור משמרת. project_arrival/project_visit הופכים גם הם לכניסה/יציאה במסלול זה.

**בדיקת סגירה מוצעת:** בדיקת שני clock_in על תגים שונים ובדיקת project_visit בזמן משמרת פתוחה; בדיקת offline שהגיע באיחור.

**מיקום בקוד:**

- [lib/attendance-sync-server.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/lib/attendance-sync-server.ts)

### 37. אירוע יכול להיות synced אף שעדכון המשמרת נכשל

**P1 · [בטוח]**

**ראיה:** עדכון clock_out אינו בודק error. בהוספת משמרת, 23505 אינו משנה result לכשל. הלקוח מוחק מהתור אירועים synced/pending_review/conflict.

**השפעה:** נוצר פער בין יומן האירועים לשעות המשמרת, והלקוח מאבד את הפריט שנועד לסנכרון. אין transaction בין event לשינוי shift.

**בדיקת סגירה מוצעת:** הזרק כשל update של משמרת ומרוץ יצירת משמרות; בדוק result והתור המקומי.

**מיקום בקוד:**

- [lib/attendance-sync-server.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/lib/attendance-sync-server.ts)
- [lib/sync-attendance.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/lib/sync-attendance.ts)

### 38. אפשר לדלג על בדיקת geofence בהשמטת קואורדינטות

**P2 · [בטוח]**

**ראיה:** lat/lng optional. בדיקת geofence נכנסת רק כששניהם קיימים; אין סימון חשוד כשהם חסרים. tag_code עצמו הוא מזהה קבוע.

**השפעה:** קוד תג ידוע יכול לשמש להחתמה מרחוק בלי חיווי outside_geofence. אם המוצר מבטיח הוכחת נוכחות פיזית, זו מגבלה מהותית.

**בדיקת סגירה מוצעת:** שלח אירוע בדיקה לתג מגודר בלי lat/lng ובדוק אם מקבל synced.

**מיקום בקוד:**

- [lib/attendance-sync-server.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/lib/attendance-sync-server.ts)
- [lib/api-body-schemas.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/lib/api-body-schemas.ts)

### 39. דיווח ליקוי מסיור יוצר תקלה לפני אימות קובץ

**P2 · [בטוח]**

**ראיה:** insert tickets קודם לבדיקת MIME/size. קובץ פסול גורם ל־400 אחרי יצירת תקלה ולפני כתיבת defect_ticket_id. עדכון הקישור לסיור אינו נבדק.

**השפעה:** העובד רואה כשל ויכול לנסות שוב וליצור תקלה נוספת; הסיור עלול להישאר בלי קישור לתקלה שנוצרה.

**בדיקת סגירה מוצעת:** בדיקת multipart עם קובץ מעל המגבלה והשוואת tickets ו־tour לפני/אחרי, בסביבה מבודדת.

**מיקום בקוד:**

- [app/api/worker/tours/defect/route.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/app/api/worker/tours/defect/route.ts)

## נתונים, ביצועים וממשק

### 40. מחיקת פרויקט סותרת את הצהרת המחיקה הרכה

**P1 · [בטוח]**

**ראיה:** ה־route קודם מעדכן deleted_at לתקלות/דיירים ואז מוחק את הפרויקט פיזית. סכמה חדשה לפי המיגרציות מגדירה ON DELETE CASCADE לפרויקט בתקלות ובדיירים.

**השפעה:** לפי סכמה זו, המחיקה הפיזית מוחקת גם את הרשומות שסומנו soft-delete ואת לוגי/רשומות המדיה של תקלות. אובדן שחזור/היסטוריה. הסכמה החיה לא אומתה; אין להסתמך על המחיקה הרכה לפני בדיקתה.

**בדיקת סגירה מוצעת:** קריאה בלבד: pg_constraint על tickets/residents. בדיקת delete-project רק במסד מבודד עם נתוני דמה.

**מיקום בקוד:**

- [app/api/delete-project/route.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/app/api/delete-project/route.ts)
- [supabase/migrations/000_initial_core_schema.sql](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/supabase/migrations/000_initial_core_schema.sql)
- [supabase/migrations/003_residents_table.sql](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/supabase/migrations/003_residents_table.sql)

### 41. Query key משותף לרשימות של 50 ושל 200 תקלות

**P2 · [בטוח]**

**ראיה:** dashboard מבקש limit=50 ו־tickets limit=200, אך ticketsQuery משתמש באותו queryKeys.ticketsOpen(clientId), בלי limit במפתח.

**השפעה:** ניווט מהדשבורד לתקלות יכול לקבל רשימה cached של 50 כנתונים טריים ולהציג רשימה חלקית בלי התרעה של 200.

**בדיקת סגירה מוצעת:** פתח dashboard ואז tickets תוך staleTime עם יותר מ־50 תקלות; השווה לכניסה ישירה.

**מיקום בקוד:**

- [lib/hooks/use-open-tickets.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/lib/hooks/use-open-tickets.ts)
- [app/dashboard/page.tsx](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/app/dashboard/page.tsx)
- [app/tickets/page.tsx](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/app/tickets/page.tsx)

### 42. ניקוי מטמון בהחלפת משתמש אינו מנקה React Query

**P2 · [סביר]**

**ראיה:** TenantAuthSync מנקה localStorage/sessionStorage בלבד. QueryClient חי ברמת AppProviders; tenant-client-id הוא query key גלובלי עם staleTime של חמש דקות.

**השפעה:** בהחלפת חשבון בלי remount מלא, cid/data cached יכולים להישאר מהמשתמש הקודם. זרימות שעושות ניווט מלא עשויות לצמצם זאת; לא אומתה דליפה חיה.

**בדיקת סגירה מוצעת:** בדיקת החלפת auth באותו mount ובשני טאבים; בדוק query cache מיד לאחר SIGNED_OUT/SIGNED_IN.

**מיקום בקוד:**

- [app/components/TenantAuthSync.tsx](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/app/components/TenantAuthSync.tsx)
- [app/components/AppQueryProvider.tsx](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/app/components/AppQueryProvider.tsx)
- [lib/hooks/use-open-tickets.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/lib/hooks/use-open-tickets.ts)
- [lib/tenant-browser-cache.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/lib/tenant-browser-cache.ts)

### 43. חיפוש בניינים מתבצע רק מתוך 80 הראשונים

**P2 · [בטוח]**

**ראיה:** שאילתה מביאה limit(80) לפי project_code ורק אז מסננת q בזיכרון.

**השפעה:** ללקוח עם יותר מ־80 פרויקטים, בניינים בהמשך הרשימה לא יימצאו בחיפוש הציבורי גם אם הכתובת נכונה.

**בדיקת סגירה מוצעת:** נתוני בדיקה עם לפחות 81 פרויקטים וחיפוש תוצאה שמופיעה רק בסוף.

**מיקום בקוד:**

- [app/api/public/projects/route.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/app/api/public/projects/route.ts)

### 44. רשימת משימות וספירת משימות פתוחות נחתכות ב־300

**P2 · [בטוח]**

**ראיה:** GET מביא עד 300 משימות ללא pagination ומחשב open_count מתוך המערך המוחזר, כולל משימות DONE ברשימה.

**השפעה:** ספירת משימות אינה בהכרח מלאה; משימות פתוחות עלולות לא להופיע אם הרשומות הראשונות ממלאות את המכסה.

**בדיקת סגירה מוצעת:** נתוני בדיקה עם 301+ משימות ושילוב DONE/PENDING.

**מיקום בקוד:**

- [app/api/maintenance-tasks/route.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/app/api/maintenance-tasks/route.ts)

### 45. Pagination דיירים אינו בעל סדר יציב

**P2 · [בטוח]**

**ראיה:** range מבוצע בסדר full_name בלבד, בלי id כשובר שוויון. quiet refresh מחליף את כל הרשימה ב־500 הראשונים.

**השפעה:** שמות זהים/שינויים בין עמודים עלולים לגרום לכפילויות או דילוגים; רענון אחרי טעינת עמודים נוספים מאפס את הרשימה.

**בדיקת סגירה מוצעת:** נתוני דמה עם שמות זהים בגבול עמוד ובדיקה אחרי quiet refresh.

**מיקום בקוד:**

- [app/residents/page.tsx](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/app/residents/page.tsx)

### 46. התרעת תקלות אומרת 300 בעוד limit בפועל 200

**P3 · [בטוח]**

**ראיה:** TICKETS_INITIAL_LIMIT=200; באנר ticketsTruncated כתוב 'מציג עד 300 תקלות'. אין מנגנון טעינת כל התקלות בבאנר הזה.

**השפעה:** מידע מטעה למנהל בנוגע להיקף הרשימה, החיפוש והייצוא מתוך הנתונים המקומיים.

**בדיקת סגירה מוצעת:** בדיקת UI עם 200+ תקלות פתוחות.

**מיקום בקוד:**

- [app/tickets/page.tsx](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/app/tickets/page.tsx)

### 47. Multipart עוקף מגבלות טקסט שנבדקות ב־JSON

**P2 · [בטוח]**

**ראיה:** create-ticket משתמש ב־Zod ב־JSON בלבד; multipart נקרא ומומר לטקסט ידנית. גם tour-defect בודק minimum description ב־multipart בלי maximum 2000 של schema JSON.

**השפעה:** גבולות קלט תלויים בפורמט. אין במימוש multipart אכיפה מקבילה של המגבלות; לאחר תיקון הדיווח הציבורי המסלול יהיה חשוף יותר.

**בדיקת סגירה מוצעת:** שלח אותה מחרוזת ארוכה ב־JSON וב־multipart לסביבת בדיקה והשווה דחייה.

**מיקום בקוד:**

- [app/api/create-ticket/route.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/app/api/create-ticket/route.ts)
- [lib/api-body-schemas.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/lib/api-body-schemas.ts)
- [app/api/worker/tours/defect/route.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/app/api/worker/tours/defect/route.ts)

## תפעול, בדיקות ומוכנות

### 48. CI ירוק אינו בודק את זרימת הדיווח הציבורי האמיתית

**P1 · [בטוח]**

**ראיה:** CI העדכני הצליח. E2E מיירט /api/create-ticket ומחזיר הצלחה מלאכותית; הבדיקה שפונה לשרת מדולגת בלי E2E_LIVE_SUPABASE, שאינו מוגדר ב־workflow. רק שני spec files של chromium רצים.

**השפעה:** החסימה של דיווח ציבורי יכולה להגיע ל־main גם כשהבדיקות ירוקות. כיסוי תשלומים, roles ו־offline בפועל אינו מובטח בריצה זו.

**בדיקת סגירה מוצעת:** בדיקה מקצה לקצה עם middleware אמיתי ונתוני דמה מבודדים; בדיקות הרשאות, callback, concurrency ו־offline.

**מיקום בקוד:**

- [.github/workflows/ci.yml](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/.github/workflows/ci.yml)
- [tests/e2e/report-ticket-media.spec.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/tests/e2e/report-ticket-media.spec.ts)

### 49. Cron תחזוקה מונעת אינו מתוזמן ב־vercel.json

**P2 · [בטוח]**

**ראיה:** קיים handler המתואר כדוח שבועי, אך אין ברשימת crons entry ל־preventive-maintenance.

**השפעה:** הדוח לא ירוץ דרך התזמון המוגדר בריפו. ייתכן תזמון חיצוני שלא נבדק.

**בדיקת סגירה מוצעת:** קריאה בלבד של scheduler בפועל ובדיקת run history; אין להפעיל cron בביקורת כי הוא שולח הודעות.

**מיקום בקוד:**

- [vercel.json](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/vercel.json)
- [app/api/cron/preventive-maintenance/route.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/app/api/cron/preventive-maintenance/route.ts)

### 50. Rate limit נכשל למצב שמאפשר את הבקשה

**P2 · [בטוח]**

**ראיה:** שגיאת RPC מחזירה rpcFailed:true,isLimited:false. ה־wrappers מחזירים isLimited:false.

**השפעה:** כאשר RPC חסר או נכשל, מסלולי פעולה ציבוריים/בתשלום ממשיכים בלי ההגבלה. זה tradeoff בקוד עם משמעות כספית ותפעולית.

**בדיקת סגירה מוצעת:** בדיקת error של bamakor_rate_limit ואימות המדיניות הרצויה למסלולים ציבוריים/גבייה.

**מיקום בקוד:**

- [lib/rate-limit.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/lib/rate-limit.ts)

### 51. חתימה דיגיטלית היא כרגע תיעוד וקישור ידני

**P2 · [בטוח]**

**ראיה:** createDocumentSignRequest יוצר provider=manual_link או pending. לא נמצא במימוש זה יצירת מעטפת/בקשה אצל ספק חתימה; sign_url מגיע מבחוץ.

**השפעה:** פער מוצר: יצירת בקשה בלי signUrl אינה מפיקה תהליך חתימה פעיל. callback בלבד אינו אינטגרציה מלאה עם ספק.

**בדיקת סגירה מוצעת:** הגדרת דרישת מוצר ובדיקת יצירה מקצה לקצה מול ספק שנבחר, בסביבה מבודדת.

**מיקום בקוד:**

- [lib/document-signing.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/lib/document-signing.ts)
- [app/api/documents/sign-request/route.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/app/api/documents/sign-request/route.ts)

### 52. כיבוי addon בקטלוג אינו נבדק בהרשאת שימוש

**P2 · [בטוח]**

**ראיה:** clientHasPaidAddon בודק client_paid_addons.enabled בלבד. paid_addons_catalog.is_active משפיע על הרשימה אך אינו נבדק ב־helper של הרשאה.

**השפעה:** אם is_active נועד להשבית שירות ולא רק להסתיר רכישה חדשה, לקוח בעל entitlement ממשיך להשתמש.

**בדיקת סגירה מוצעת:** הכרע משמעות is_active; בדיקת addon catalog מושבת עם entitlement קיים.

**מיקום בקוד:**

- [lib/paid-addons.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/lib/paid-addons.ts)
- [lib/require-paid-addon.ts](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/lib/require-paid-addon.ts)

## פערי אימות חיצוניים שלא ניתן להכריע מהקוד

| נושא | מה ידוע | מה לא אומת |
|---|---|---|
| Production | נבדקה גרסת main מסוימת | deployment פעיל ו־commit המקושר אליו |
| Grow | יש קוד S2S, Approve, invoiceNotifyUrl ו־retry | callback מקורי לעסקת Bit, אישור בפועל, settlement, חשבונית רשמית, ארנק ו־Apple Pay בכל סביבת שימוש |
| מסמך ביקורת Grow הקודם | [המסמך מ־28.09](https://github.com/YoniLevy10/Bino/blob/1732e09a53eb28f7ac56ddcf6572d307384be4e7/docs/GROW_INTEGRATION_AUDIT_2026-09-28.md) מציין שחסרו אימותים חיצוניים | האם החסימות נסגרו מאז; אין לראות את סטטוס המסמך הישן כאימות מצב חי היום |
| RLS והרשאות | מיגרציות hardening קיימות | policies, GRANTs, פונקציות וסכמה שהוחלו במסד החי |
| הגדרות אבטחה | נבדקו validators ו־auth helpers | קיום כל הסודות, מדיניות WAF, headers בפריסה ויכולת ביטול sessions |
| גיבוי | קיימת מחיקה רכה בחלק מהמסלולים | גיבוי, PITR אם רלוונטי, שחזור מתורגל וקבצי storage לאחר מחיקה |
| ביצועים | React Query, caches, pagination דיירים ו־KPI RPC קיימים בקוד | זמני p50/p95 ברשת סלולרית ובמכשיר אמיתי; אין להסיק שחסר React Query מהביקורת הישנה |
| קבצים | ולידציה מבוססת MIME/size קיימת | אימות תוכן הקובץ, מדיניות קבצים זדוניים ומגבלות ingress חיות |
| תוספים/תמחור | יש entitlement checks וקטלוג | משמעות is_active, אכיפת תוספים גם בכתיבה ישירה, גבייה והסכמים מסחריים |

## מה כבר קיים ואינו צריך להירשם כפער ישן

- [בטוח] קיים `@tanstack/react-query` וספק QueryClient; הבעיה שמצאתי היא במפתחות ובניקוי, ולא היעדר מוחלט של caching.
- [בטוח] קיימות מיגרציות tenant RLS ו־hardening. אין בסיס לטעון שכל טבלאות המערכת פתוחות לציבור בלי לבדוק את המדיניות החיה.
- [בטוח] worker-auth לפי אימייל בלבד חסום ב־403; זה אינו מסלול פתוח לקבלת token לפי אימייל.
- [בטוח] סודות WhatsApp מוסרים מתשובת settings/read; לא דווחה חשיפת service-role key על סמך השערה.
- [בטוח] קיימים rate-limit RPC, בדיקת סכום תשלום, private attachments וחתימת Meta helper. הממצאים מתייחסים לנקודות שבהן בקרות אלה לא נאכפות או לא מספיקות.

## ראיית CI

[הריצה של ה־commit שנבדק](https://github.com/YoniLevy10/Bino/actions/runs/36682434577) סיימה בהצלחה. זה מעיד שהבדיקות שהוגדרו לריצה עברו; זה אינו מעיד שכל הזרימות, הסכמה החיה או תהליך התשלום אומתו. ריצת main ישנה יותר נכשלה ולא דווחה ככשל נוכחי.

## הוראות להעברת הדוח למפתח

זהו דוח קריאה בלבד, לא אישור לבצע שינויים. לכל ממצא שהוחלט לתקן יש לשמור את מזהה הממצא, לכתוב בדיקה שמדגימה את הפער, לבצע תיקון ממוקד ולציין ראיית סגירה. אין לסמן 'נסגר' על סמך CI כללי, הסתרת כפתור, catch ריק או שינוי טקסט. ממצאים התלויים ב־Grow או במסד חי צריכים ראיות חיות נפרדות ובהרשאה מתאימה. יש לבצע audit נוסף לפורטל הדיירים לפני מיזוגו/שחרורו.
