# סוכן לידים למכירת BINO (Sales Lead Agent)

סוכן פלטפורמה (לא פיצ׳ר tenant) שרץ פעם ביום, סורק מקורות חוקיים בישראל, ומביא לידים שאפשר לפנות אליהם מהר להציע את BINO.

מבוסס על מנוע הגילוי של Fixly (`lib/prospects/*`) — עם ICP הפוך: **קונים ארגוניים של פלטפורמה**, לא בעלי מקצוע עצמאיים.

## יעד הכנסה

יעד: **₪100,000 MRR**.

| מסלול | מחיר | לקוחות ליעד |
|-------|------|-------------|
| Pro | ₪499 | ~200 |
| Business | ₪699 | ~143 |
| מיקס + add-ons | — | פחות לקוחות |

לכן הסוכן **לא** ננעל רק על «חברות אחזקת בניינים». הוא מחפש כל מי שמנהל תפעול מרובה-בניינים ומרגיש כאב של תקלות / SLA / עלויות.

## סגמנטים (ראש גדול)

| slug | קהל |
|------|------|
| `building_mgmt` | חברות ניהול / אחזקת בניינים |
| `property_mgmt` | ניהול נכסים / דירות להשקעה |
| `facility_mgmt` | ניהול מתקנים (FM) |
| `condo_tower` | ניהול מגדלי מגורים |
| `vaad_bayit_mgmt` | חברות ניהול ועדי בתים |
| `housing_corp` | דיור ציבורי / חברות דיור |
| `student_housing` | מעונות סטודנטים |
| `senior_housing` | דיור מוגן |
| `real_estate_dev` | יזמים עם אחזקה אחרי מסירה |
| `office_park` | פארקי משרדים / מתחמים |
| `aparthotel` | דירות נופש / אפרטהוטל |
| `kibbutz_housing` | קיבוץ/מושב — אחזקת מבנים |

כל סגמנט מקבל **זווית פנייה** (`outreach_angle`) שמחוברת לבידול BINO: זיכרון תפעולי, שיוך אוטומטי, תקלות חוזרות, SLA, הוכחת חיסכון.

## מקורות (חוקיים בלבד)

כמו Fixly — **אין** סקרייפינג ממידרג / B144 / דפי זהב / איזי / קבוצות פייסבוק.

| מקור | Env |
|------|-----|
| Google Places API (New) | `GOOGLE_PLACES_API_KEY` |
| OpenStreetMap Overpass | חינם |

גיאוגרפיה: **ירושלים + תל אביב + המרכז/גוש דן** (`ISRAEL_SALES_CITIES`). כל ריצה בלי עיר כפויה סורקת כמה ערים יחד (תמיד ת״א+ירושלים + ערים מתחלפות מהמרכז). כפייה: `BINO_SALES_CITY` (עיר אחת) או `BINO_SALES_CITIES` (רשימה מופרדת בפסיקים).

## רכיבים

| נתיב | תפקיד |
|------|--------|
| `lib/sales-leads/*` | קונפיג ICP, fit לקונים, adapters, ingest, discover |
| `app/api/cron/discover-sales-leads` | קרון יומי 05:00 UTC |
| `app/api/superadmin/sales-leads*` | API לרשימה / גילוי ידני / סטטוס |
| `app/superadmin` → טאב **לידים** | תור פנייה מהיר + WhatsApp |
| `supabase/migrations/098_sales_leads.sql` | טבלאות |

## משתני סביבה

| מפתח | תיאור |
|------|--------|
| `GOOGLE_PLACES_API_KEY` | **חובה** לגילוי — מפתח Google Places API (New) |
| `GOOGLE_MAPS_API_KEY` | חלופה אם אין `GOOGLE_PLACES_API_KEY` (אותו מפתח Maps Platform) |
| `CRON_SECRET` | אימות הקרון |
| `ADMIN_SETUP_SECRET` | Superadmin API |
| `BINO_SALES_CITY` | כפיית עיר אחת (אופציונלי) |
| `BINO_SALES_CITIES` | רשימת ערים לריצה (אופציונלי, עדיף על עיר אחת) |
| `BINO_SALES_SEGMENT_SLUGS` | רשימת סגמנטים מופרדת בפסיקים |
| `BINO_SALES_DISCOVERY_API_CALL_BUDGET` | תקציב קריאות Places (ברירת מחדל 120) |
| `BINO_SALES_DISCOVERY_INCLUDE_OSM` | `1` כדי להריץ גם OSM (ברירת מחדל: Places בלבד) |

### חובה בצד Google Cloud

1. ליצור מפתח API ב-[Google Cloud Console](https://console.cloud.google.com/apis/credentials).
2. להפעיל **Places API (New)** (לא רק Places API legacy).
3. לוודא שיש **billing** פעיל על הפרויקט.
4. להדביק את המפתח ב-Vercel → Environment Variables → Production (+ Preview אם צריך) בשם `GOOGLE_PLACES_API_KEY`.
5. Redeploy אחרי הוספת המשתנה.

בלי המפתח הגילוי נכשל מיד עם הודעה ברורה בפאנל הלידים — OSM לבדו כמעט לא מחזיר חברות ניהול בישראל.

## דירוג התאמה (הפוך מ-Fixly)

- **מעדיף** חברות / ניהול / אחזקה / מתחמים / רשתות
- **דוחה** אינסטלטורים, חשמלאים, חנויות חומרים (שייכים ל-Fixly)

שדות: `fit_score`, `fit_class`, `contactability`, `estimated_mrr_ils`, `outreach_angle`.

## הפעלה

1. להחיל מיגרציה `098_sales_leads.sql` (+ `099_…`) על production (לא preview branch).
2. להגדיר `GOOGLE_PLACES_API_KEY` ב-Vercel + להפעיל Places API (New) וחיוב ב-Google Cloud.
3. Redeploy.
4. Superadmin → לידים → «הרץ גילוי עכשיו» (או לחכות לקרון 05:00 UTC).
5. לפתוח WhatsApp מהכרטיס → סטטוס עובר ל-`contacted`.

אם הגילוי «לא עובד»: בדקו בפאנל באנר «חסר מפתח Google Places», ובטבלת `sales_lead_discovery_runs` את `error_message`. ריצות `running` ישנות (>8 דק׳) משתחררות אוטומטית.

## מדידת הצלחה

- לידים `suitable` עם טלפון נייד ליום
- % מעבר ל-`demo_scheduled` / `won`
- סכום `estimated_mrr_ils` בצנרת מול 100K
