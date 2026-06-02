# שיפורים — יומן + שעון עובדים (ענף `develop`)

**סטטוס:** רוב הספרינטים A–E יושמו (יוני 2026). נותרו: OAuth מלא ל-Google Calendar, תזכורות SMS לפני פגישה.

**איך לבדוק:** `npm run dev` ב-`bamakor-dashboard-dev` → `/calendar`, `/attendance`

---

## ספרינט A — עיצוב אחיד ✅

- [x] `styles.content` + KPI + skeleton — יומן ושעון
- [x] `PageHeader` / `MobileHeader` / `MobileMenu`
- [x] `TM` + `asyncHandler`
- [x] הערות קובץ בראש הדפים
- [x] ניווט סרגל + **סרגל תחתון מובייל** (`/calendar`, `/attendance`)

## ספרינט B — יומן ✅

- [x] לוח חודש + רשימת יום
- [x] תצוגת שבוע
- [x] עריכה / מחיקה (API + מגירה)
- [x] סינון חיפוש + בניין
- [x] סוג אירוע + כל היום
- [x] ייצוא iCal
- [x] קישור «הוספה ל-Google Calendar» (תבנית URL, לא OAuth)

## ספרינט C — שעון עובדים ✅

- [x] KPI + QR Card + רשימת עובדות בכרטיסים
- [x] טבלת רישומים + סינון תאריכים
- [x] ייצוא Excel + עלות שעתית
- [x] הדפסת QR

## ספרינט D — P1 ✅

- [x] מפת GPS (קישורי Google Maps + אזהרת גדר)
- [x] תיקון שעות ידני (מנהל)
- [x] השבתת עובדת (`is_active`)
- [x] ריענון QR
- [x] מסך סריקה משופר (branding, הצלחה, session `st`)
- [x] `workers.receives_new_ticket_alerts` + webhook

## ספרינט E — P2 (חלקי) ✅

- [x] גדר גיאוגרפית (הגדרה + אזהרה בהחתמה)
- [x] עלות לפי `hourly_rate`
- [x] התראה משמרת פתוחה ארוכה (`stale`)
- [ ] OAuth Google Calendar מלא
- [ ] תזכורת SMS לפני פגישת ועד
- [ ] PIN בסריקה (לא נדרש כרגע)

---

*ענף `develop` בלבד — לא למזג ל-`main` לפני בדיקה.*
