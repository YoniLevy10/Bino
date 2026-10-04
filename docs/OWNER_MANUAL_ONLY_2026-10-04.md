# מה נשאר ידני אצלך בלבד (2026-10-04)

כל פער סוכן נסגר / ממוזג. להלן **רק** פעולות שדורשות אותך (אין סודות בצ׳אט).

---

## 1. Superadmin MFA (חובה לפני שימוש בסופר־אדמין)

הקוד כבר בפרוד (`#243`). בלי זה אין גישה תקינה אחרי הסרת ה־secret.

1. Vercel → project **bino** → Environment Variables → הוסף:
   - `SUPERADMIN_EMAILS` = האימייל שלך (או רשימה מופרדת בפסיקים)
   - אופציונלי: `SUPERADMIN_USER_IDS` = UUID מ־Supabase Auth
2. Supabase → Authentication → MFA → הפעל TOTP.
3. התחבר עם אותו יוזר → enroll במאמת (Google Authenticator / 1Password וכו').
4. ודא ש־`/api/superadmin/session` מחזיר `aal: "aal2"` אחרי login + MFA.

---

## 2. אישור גיבויים Bamakor (2 דקות, read-only)

1. פתח: https://supabase.com/dashboard/project/jsliqlmjksintyigkulq/database/backups  
2. רשום / צלם: רשימת daily backups + האם PITR דלוק (earliest/latest).  
3. **אל** תרכוש PITR ו־**אל** תשחזר על Bamakor בלי אישור נפרד.

---

## 3. Vercel MCP לניטור (אופציונלי לסגירת הוכחת runtime logs)

1. Cursor → MCP / Vercel → Disconnect → Reconnect.  
2. ב־OAuth בחר את ה־team של פרויקט **bino**: `team_WWxoCoCEGaEAK0e2JknuqGxq` (לא רק personal `yonilevy10s-projects`).  
3. אחרי זה אפשר לאמת ב־Runtime Logs את ה־cron שכבר רץ (`db_connected` ב־06:00 UTC — כבר ב־`system_logs`).

> **הערה:** שורת cron חיה כבר **הוכחה** ב־DB. הפעולה הזו רק ל־Vercel logs / ערוץ התראה.

---

## 4. Grow sandbox — חוסם Go גבייה

1. אשר מפתחות Grow sandbox ב־Vercel (או העתק לסוכן פעם אחת מחוץ לצ׳אט ציבורי).  
2. הרץ / אשר E2E: יצירת חיוב sandbox → תשלום sandbox → webhook → חשבונית.  
3. **בלי** חיובים אמיתיים לדיירים.

---

## 5. החלטת D3 (עסקי)

4 שורות `collection_charges` סווגו כנתוני בדיקה (`COLLECTION_CHARGE_ANOMALY_…`).  
החלט: להשאיר / לסמן / לנקות — **בלי** Approve אוטומטי.

---

## 6. עומס יעד (אופציונלי לסגירת No-Go עומס)

על מכונה עם build תקין:

```bash
supabase start
npm run build && npm start
npm run load:isolated
```

לעולם לא על `https://bino.casa`.

---

## לא דורש ממך עכשיו

- מיזוג מיגרציות 111/112/113/121/122 — כבר בפרוד  
- MFA/xlsx/recommendations/storage/load-harness — כבר ממוזג לפרוד  
- Cron `db_connected` — כבר רץ 2026-10-04 06:00:31 UTC
