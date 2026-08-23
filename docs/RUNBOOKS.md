# Bamakor Runbooks

Operational guides for platform and tenant features.

---

## גבייה ותשלומים (Morning)

צ׳קליסט מלא: [`COLLECTIONS_GO_LIVE.md`](COLLECTIONS_GO_LIVE.md)

**חשבון אישי לכל לקוח** — אין מפתחות/סליקה משותפים במקור. הכסף נכנס לחשבון Morning של אותו לקוח בלבד.
מודל מלא: [`PAYMENTS.md`](PAYMENTS.md)

### לפני שליחה לדיירים

1. `GREENINVOICE_WEBHOOK_SECRET` מוגדר ב-Vercel (Production).
2. הלקוח מילא בהגדרות → Morning שם/טלפון/כתובת **של העסק שקולט את הכסף**.
3. Morning Digital Payments: אתר = `https://bamakor.vercel.app/vaad-pay/{clientId}` → עדכון → **אישור Grow**.
4. בהגדרות Bamakor → Morning → העתיקו את Webhook URL (כולל token) ל-Morning → Webhooks **בחשבון של הלקוח**.
5. מפתחות API **של הלקוח** (לא לשתף בין לקוחות) + בדיקת חיבור ירוקה; סליקה פעילה ב-Morning.
6. תוסף גבייה מופעל ללקוח.
7. **תשלום ניסיון אחד** — ודאו שסטטוס עובר ל«שולם» ב־`/collections`.

### התנהגות מערכת

- שליחת חיוב נחסמת אם חסר סוד webhook בשרת.
- מסך גבייה חוסם שליחה עד שמפתחות Morning האישיים מוגדרים ומופעלים.
- מפתח API לא יכול להיות משויך לשני לקוחות במקור.
- בדף `/pay` הדייר מזין מייל (מומלץ) / טלפון ומאשר **תקנון** לפני מעבר לסליקה; אחרי תשלום נשלח אישור במייל (Resend).
- עמוד Grow של הלקוח: `/vaad-pay/{clientId}` (פרטי העסק מההגדרות). `/vaad-pay` הכללי הוא עמוד פלטפורמה בלבד.
- עמודי תקנון/פרטיות משותפים: `/terms`, `/privacy`.
- ביטול חיוב מבטל את קישור `/pay/...` של Bamakor (קישור Morning הישן עלול עדיין להיות פתוח אצלם).
- «סמן כשולם» — גיבוי ידני אם ה-webhook פספס.

### חיבור Morning מחזיר 401

- מיוני 2026 הטוקן יוצא מ-OAuth IdP (`api.morning.co`), לא מ-`/account/token`.
- מזהה מפתח הוא UUID מ-Morning → הגדרות → מפתחות API — לא כתובת דשבורד.
- ארגז חול / ייצור חייבים להתאים למפתח שנשמר.

---

## חתמת עובדים (NFC — worker stamp)

### URL format for stickers

Program each NFC sticker with a URL record:

```
https://bamakor.vercel.app/worker/nfc?t=TAG_CODE
```

- `TAG_CODE` — uppercase alphanumeric (e.g. `OFFICE`, `BMK1`). Normalized server-side.
- Worker must open personal SMS link **once** on that phone (`/worker?token=…`), then stamps are tap-only.
- After stamp: full-screen «נכנסת / יצאת» — **no redirect** into the tickets portal, **no GPS prompt**.
- Office QR clock (`/attendance/scan`) is **deprecated** — field workers use NFC only.
- Super Admin can **deactivate** or **delete** a tag (with confirm). Field stickers keep working unless that specific tag is disabled/removed.

### Super Admin setup

1. Enable paid addon **worker_stamp** for the client.
2. `/superadmin` → client → **NFC tags** → create all tags (office + one tag per project).
3. Walk through wizard: copy URL → write with NFC Tools (Android) or TagWriter (iOS).
4. Mark sticker as installed when mounted on the door.
5. Print sheet: sticker print sheet (QR + building name per tag).

### Manager rollout

1. `/attendance` — follow setup checklist.
2. Review **מדבקות NFC / QR** panel — copy URL / verify QR matches physical sticker.
3. Send SMS links to all workers.
4. Print worker guide: `/attendance/worker-guide`.
5. Mark checklist «בדיקת מדבקה» after one successful clock in/out.
6. Monitor today summary, live workers, anomalies, sticker progress.

### Deprecated (removed)

- Office QR station (`/api/attendance/clock`, `/api/attendance/station`, office staff APIs) — deleted.
- `/attendance/scan` remains a public redirect stub to `/attendance` for old printed QR stickers.

### Cron jobs (Vercel)

| Path | Purpose |
|------|---------|
| `/api/cron/attendance-stale-shifts` | Open shift > 10h → auto-close as missing_checkout |
| `/api/cron/attendance-pending-alert` | Daily SMS/email for pending review |
| `/api/cron/attendance-open-shift-reminder` | Push reminder for long open shifts |

All require `Authorization: Bearer $CRON_SECRET`.
