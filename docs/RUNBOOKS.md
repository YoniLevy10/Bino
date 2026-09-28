# Bino Runbooks

Operational guides for platform and tenant features.

---

## גבייה ותשלומים (Grow)

צ׳קליסט מלא: [`COLLECTIONS_GO_LIVE.md`](COLLECTIONS_GO_LIVE.md)

**חשבון אישי לכל לקוח** — Bino מחזיקה מפתחות פלטפורמה; הכסף נכנס לחשבון Grow של אותו לקוח (`userId`).
מודל מלא: [`PAYMENTS.md`](PAYMENTS.md)

### לפני שליחה לדיירים

1. `GROW_API_KEY` + `GROW_X_API_KEY` + `GROW_PAGE_CODE` + `GROW_WEBHOOK_SECRET` ב-Vercel.
2. להצטרפות אוטומטית: `GROW_REGISTER_X_API_KEY` + `GROW_MARKETER` + `GROW_PRICE_QUOTE` (+ webhook הרשמה אצל Grow ל־`/api/webhook/grow-register?token=`).
3. הלקוח: GetLink בהגדרות → Grow **או** הדבקת `userId` ידנית + הפעלת חיבור + פרטי עסק.
4. תוסף גבייה מופעל ללקוח.
5. **תשלום ניסיון אחד עם callback מקורי** — «שולם» ב־`/collections` + `grow_approve_status=ok`. תשלום ב-Grow בלי callback ל-BINO ≠ סגירת שרשרת. Bit/Apple עלולים להיות כסף אמת גם ב-sandbox.

### התנהגות מערכת

- שליחת חיוב נחסמת אם חסר סוד webhook בשרת.
- מסך גבייה חוסם שליחה עד ש-`userId` מוגדר ומופעל.
- `userId` לא יכול להיות משויך לשני לקוחות Bino.
- `/pay`: קישור תשלום **ו/או** ארנק SDK; «שולם» רק מ-S2S, לא מ-`onSuccess` בדפדפן.
- כשל Approve: החיוב נשאר שולם; כפתור «נסה לאשר עסקה שוב» (דורש token מה-callback).
- עמוד העסק: `/vaad-pay/{clientId}`. תקנון/פרטיות: `/terms`, `/privacy`.
- ביטול חיוב מבטל `/pay/...` של Bino.
- «סמן כשולם» — גיבוי ידני אם ה-webhook פספס.

---

## חתמת עובדים (NFC — worker stamp)

### URL format for stickers

Program each NFC sticker with a URL record:

```
https://YOUR_APP_URL/worker/nfc?t=TAG_CODE
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
