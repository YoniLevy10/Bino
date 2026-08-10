# Bamakor Runbooks

Operational guides for platform and tenant features.

---

## חתמת עובדים (NFC — worker stamp)

### URL format for stickers

Program each NFC sticker with a URL record:

```
https://bamakor.vercel.app/worker/nfc?t=TAG_CODE
```

- `TAG_CODE` — uppercase alphanumeric (e.g. `OFFICE`, `BMK1`). Normalized server-side.
- Worker must open personal link once: `/worker?token=…` (from SMS).
- Office QR clock (`/attendance/scan`) is **deprecated** — field workers use NFC only.

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
