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

## Building decision reminders (HSM gap)

Manager «תזכורת לחתימה» (`POST /api/building-governance/decisions/remind`) uses:

| Channel | When |
|---------|------|
| SMS (019) | Primary when `BUILDING_GOVERNANCE_AUTO_NOTIFY` is on |
| Email (Resend) | When signer has email |
| WhatsApp free-form | **Only** inside Meta 24h customer-care session |

There is **no** approved Meta UTILITY (HSM) template in the Composio catalog for building-decision / signature reminders yet. Do **not** send free-form WA outside the session window (Meta policy). To enable cold WA reminders later: create + approve a UTILITY template (e.g. `building_decision_reminder`) via this panel / `scripts/composio-sync-meta-templates.mjs`, then wire send — until then SMS/email only.
