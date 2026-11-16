# BINO 2.0 — Roadmap ביצוע (נעול אחרי אישור הנהלה)

**תאריך:** 16.11.2026  
**סטטוס:** סדר ביצוע מחייב לצוות / Cursor  
**מקורות:** פגישת לקוח · המלצות ארכיטקט · OSS research · Speed Insights P0

---

## השלב הבא עכשיו

**P0 מובייל לפי שרה (Bamakor)** + **PR1 Speed Insights** — דשבורד/תקלות/WA/worker בטלפון (שיא 18:00–19:00).  
פירוט: [`BINO_BAMAKOR_MOBILE_USAGE_PRIORITIES_HE.md`](./BINO_BAMAKOR_MOBILE_USAGE_PRIORITIES_HE.md) · קנבס `sarah-bamakor-mobile-usage`  
תוכנית Perf: `.cursor/plans/israel_speed_insights_p0_85e61d1e.plan.md`

רק אחרי ייצוב P0 מובייל + PR1(+PR2): Finance Phase 1 מאחורי feature flag.

**ביצוע מקבילי:** כמה סוכני Cursor לפי [`BINO_PARALLEL_AGENTS_PLAYBOOK_HE.md`](./BINO_PARALLEL_AGENTS_PLAYBOOK_HE.md) — Wave1 (Perf/Palette/Tickets mobile) במקביל → Wave2 (Pros/Hub) → Wave3 (Finance/Bank) מאחורי flags, בלי לדרוס קבצים משותפים.

---

## סדר נעול

| סדר | שלב | תוצר | תלויות | מאמץ (הערכה) |
|-----|------|------|--------|----------------|
| 0 | **P0 מובייל שרה** | דשבורד+תקלות (כרטיס מלא־מסך)+WA Inbox מובייל־ראשון+worker skeleton | נתוני שימוש Bamakor | קצר–בינוני |
| 1 | **PR1 Perf** | CLS/LCP: AppShell, worker skeleton, dashboard shell, drop Inter | משרת P0 | קצר |
| 1b | **Palette V2** | השלמת tokens מנהל (nav/charts/payment/buttons) + ניקוי hex; ראה [`BINO_COLOR_PALETTE_V2.md`](./BINO_COLOR_PALETTE_V2.md) | אחרי/ליד PR1; לא מערבב Marketing | קצר |
| 2 | **PR2 Pros** | דירוג/הערה/use_count לאנשי מקצוע בכל המערכת | PR1 מומלץ לפני | קצר–בינוני + migration |
| 3 | **Finance Phase 1** | הוצאות, קטגוריות, תקציב, מרכז פיננסי; Grow ללא שינוי; צבעי `payment*`/`kpi*` | flag; Palette V2 מומלץ | 10–14 שבועות |
| 4 | **Phase 1.5 Hub UI** | `BuildingHubModal` ממורכז + משטחי V2 | Palette V2; אחרי/במקביל לתחילת Phase 1 | 1–2 שבועות |
| 5 | **Phase 1b בנק** | `israeli-bank-scrapers` + worker + `bank_transactions` | Phase 1 בסיסי; flag; פיילוט | 4–8 + תשתית |
| 6 | **Phase 2 Governance** | ועד, מסמכים+עין, החלטות+קישור חתימה (**רוב**) בתוך ה־Hub | Hub UI | 8–12 |
| 7 | **Phase 3 Reports** | דוחות OPC-style (פורט מ־OPC) + רבעון אוטומטי | בנק + הנה״ח | 6–10 |
| 8 | **Phase 4 AIS** | החלפת BankDataProvider ל־Feezback/Open-Finance | Phase 1b API יציב | 8–14 + ספק |
| 9 | **Phase 5** | פתיחת חשבון / ייזום תשלומים | External | חסום עד ספק |

---

## מיחזור חובה

ראה [`BINO_OPEN_SOURCE_RESEARCH.md`](./BINO_OPEN_SOURCE_RESEARCH.md):

- OPC → PDF/Excel/דירוג/מסמכים  
- Bino → Grow/ledger  
- Moked/Fixly → isolation + flags  
- scrapers + signature_pad + Recharts  

---

## Backlog (לא MVP)

הוצאה משותפת לבניינים · חיוב חוזר מתקציב · דוח רו״ח · Statement דייר · WA על חריגת תקציב · הוצאה↔תקלה · OPC backlog (recurrence, pre-breach SLA, bundling, true-cost).

---

## DoD לכל שלב

Feature flag · אין רגרסיית Grow/login · Bamakor smoke · runtime errors נקיים מ־P0 · PR לא מערבב auth.
