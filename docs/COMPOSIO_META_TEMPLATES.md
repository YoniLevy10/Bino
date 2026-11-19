# Composio → Meta WhatsApp templates (service only)

Superadmin panel **מדריך Meta WhatsApp** (`MetaWhatsAppPendingPanel` on `/superadmin` → Ops) can create/adapt **UTILITY** message templates via Composio instead of copy-paste into Business Manager.

## Hard limits

- **Service templates only** (ticket open/close, SLA, manager reply, worker assignment).
- **No MARKETING** / cold sales WhatsApp blasts through this flow (Israeli anti-spam + Meta policy + product ban).

## Env (Vercel + local `.env.local`)

| Variable | Purpose |
|----------|---------|
| `COMPOSIO_API_KEY` | Composio project API key |
| `COMPOSIO_WHATSAPP_CONNECTED_ACCOUNT_ID` | Connected WhatsApp account id/alias (e.g. `whatsapp_lookum-behead`) |
| `COMPOSIO_USER_ID` | Optional; defaults to `bino-platform` |

Without these, the API returns **503** with Hebrew: `יש לחבר Composio / Meta`.

## App routes

- `GET /api/superadmin/meta-templates` — live statuses for catalog specs
- `POST /api/superadmin/meta-templates` — create UTILITY template (`spec_id`, optional `name_suffix` / `body_override`)

## Operator script

```bash
export COMPOSIO_API_KEY=…
export COMPOSIO_WHATSAPP_CONNECTED_ACCOUNT_ID=whatsapp_lookum-behead

node scripts/composio-sync-meta-templates.mjs list
node scripts/composio-sync-meta-templates.mjs create ticket_closed
node scripts/composio-sync-meta-templates.mjs create ticket_closed --suffix=bamakor
```

## Still manual

- Meta **approval delay** (PENDING → APPROVED/REJECTED).
- Image-header templates (e.g. `worker_completion_photo`) — create in Meta UI.
- Mapping a client-specific `name_suffix` into runtime send env (`WHATSAPP_META_TEMPLATE_*`) if you diverge from the default platform names.
- WABA display name / webhook / App Secret tasks remain in the panel checklist.

## Manager outreach (`manager_reply`) — inbox start outside 24h

When a manager composes in the WhatsApp inbox and the Meta customer-care window is closed, Bino sends the UTILITY template with **their compose text as `{{2}}`** (no second typing). Recipient can tap **«קיבלתי»** (QUICK_REPLY) or reply freely — either opens the 24h free-form window.

### Exact template to approve in Meta (or create via Composio)

```bash
node scripts/composio-sync-meta-templates.mjs create manager_reply
```

| Field | Value |
|-------|--------|
| Name | `manager_reply` (override: `WHATSAPP_META_TEMPLATE_MANAGER_REPLY`) |
| Category | UTILITY |
| Language | `he` |
| Body | `שלום {{1}},\n\n{{2}}\n\nלאישור קריאה לחצו «קיבלתי», או השיבו בהודעה.` |
| Footer | `צוות הניהול` |
| Buttons | QUICK_REPLY · `קיבלתי` |
| `{{1}}` sample | יוני |
| `{{2}}` sample | נשמח לתאם הגעה מחר בין 9:00 ל-11:00. אפשר להשיב כאן. |

If an older `manager_reply` without buttons is already APPROVED: create `manager_outreach` (or `manager_reply` + `--suffix=…`), wait for approval, set `WHATSAPP_META_TEMPLATE_MANAGER_REPLY` to that name. Send path still works with the buttonless template — only the quick-reply UX is missing until the new one is live.

**Live submit (2026-11-19, Composio account `moked-test` / `whatsapp_lookum-behead`):** `manager_reply` (he, UTILITY) created with BODY + QUICK_REPLY «קיבלתי» → Meta id `1463206675260580`, status **PENDING**. Footer `צוות הניהול` was not included on that submit (Composio create schema enum is HEADER/BODY/BUTTONS; do **not** delete the PENDING name to recreate — Meta blocks name reuse ~30 days). Default send name stays `manager_reply` — no `WHATSAPP_META_TEMPLATE_MANAGER_REPLY` override needed unless you later approve an alternate name. Wait for Meta **APPROVED** before relying on cold inbox compose.

Webhook: tap on «קיבלתי» is stored as inbound engagement and **does not** open a ticket / AI intake.

## Building decision reminders (HSM gap)

Manager «תזכורת לחתימה» (`POST /api/building-governance/decisions/remind`) uses:

| Channel | When |
|---------|------|
| SMS (019) | Primary when `BUILDING_GOVERNANCE_AUTO_NOTIFY` is on |
| Email (Resend) | When signer has email |
| WhatsApp free-form | **Only** inside Meta 24h customer-care session |

There is **no** approved Meta UTILITY (HSM) template in the Composio catalog for building-decision / signature reminders yet. Do **not** send free-form WA outside the session window (Meta policy). To enable cold WA reminders later: create + approve a UTILITY template (e.g. `building_decision_reminder`) via this panel / `scripts/composio-sync-meta-templates.mjs`, then wire send — until then SMS/email only.
