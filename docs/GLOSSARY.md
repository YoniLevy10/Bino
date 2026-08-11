# מילון מוצר — במקור (Bamakor)

מקור אמת לשמות בעברית ובאנגלית בקוד/UI/תיעוד.
כשמשנים שם בסיידבר או בתוסף — מעדכנים גם כאן.

## מותג

| עברית | אנגלית / קוד | הערות |
|--------|----------------|--------|
| במקור | Bamakor | שם המוצר בכל חומר שיווקי |
| Bamakor Dashboard | הריפו / האפליקציה | `bamakor.vercel.app` |

## תפקידים

| עברית | מי זה | נקודת כניסה |
|--------|--------|-------------|
| מנהל / משרד | משתמש Google Auth של הלקוח (tenant) | `/login` → לוח בקרה |
| עובד שטח | עובד עם `access_token` | `/worker?token=` / `/worker/nfc` |
| דייר | מדווח תקלה / משלם | WhatsApp, `/report`, `/pay/...` |
| סופר־אדמין | תפעול פלטפורמה | `/superadmin` |

## ליבת המוצר (תמיד בסיידבר כשפעיל)

| עברית (UI) | נתיב | `sidebar` id / addon |
|------------|------|----------------------|
| לוח בקרה | `/` | `dashboard` |
| תקלות | `/tickets` | `tickets` |
| פרויקטים | `/projects` | `projects` (= בניינים) |
| דיירים | `/residents` | `residents` |
| העובדים שלי | `/workers` | `workers` |
| סיכום | `/summary` | `summary` |
| תיבת WhatsApp | `/whatsapp-inbox` | `whatsapp_inbox` (תוסף) |
| חתמת עובדים | `/attendance` | `attendance` (תוסף; בסיידבר כיום: «החתמת עובדים») |
| גביית ועד | `/collections` | `collections` (תוסף; PR #77 מציע: «גבייה ותשלומים») |

## תוספים נוספים (`/addons`)

| עברית | נתיב | מפתח |
|--------|------|------|
| יומן משרד | `/calendar` | `calendar` |
| אנשי מקצוע | `/professionals` | `professionals` |
| SMS פיילוט לדיירים | `/pilot-sms` | `pilot_sms` |
| תיקיית מסמכים | `/project-documents` | `project_documents` |
| קמפיינים SMS | `/campaigns` | `campaigns` |
| קודי QR | `/qr` | `qr` |
| תבניות וואטסאפ | `/settings/whatsapp-templates` | `whatsapp_templates` |

## מונחים טכניים / תפעול

| עברית | משמעות |
|--------|---------|
| חתמת NFC | מדבקת NDEF עם URL ל־`/worker/nfc?t=TAG` — לא Web NFC API |
| תקלה | `tickets` — דיווח דייר או משרד |
| לקוח / tenant | שורת `clients` (+ `organizations`) |
| תוסף בתשלום | `paid_addons` / entitlements בסופר־אדמין |
| Morning | ספק סליקה/חשבוניות לגבייה (`/collections`) |
| 019SMS | ספק SMS — שולח רק כמספר `972…`, בלי אימוג'י |

## שיווק (ציבורי)

| עברית | נתיב |
|--------|------|
| דף למנהלי בניינים | `/for-managers` (PR #81) |
| סרטון פרומו | `public/marketing/bamakor-promo.mp4` |

## כללי עקביות

1. **שם מוצר אחד** לכל פיצ׳ר — לא «שעון נוכחות» ו«חתמת» במקביל.
2. **פרויקט = בניין** במוצר; בקוד הטבלה נשארת `projects`.
3. כתיבות הגדרות לקוח — רק דרך API (`/api/settings/update`), לא מהדפדפן ישירות.
4. אחרי שינוי שם ב־UI — לעדכן: `lib/sidebar-nav.ts`, `lib/paid-addons-catalog.ts`, README, והקובץ הזה.
