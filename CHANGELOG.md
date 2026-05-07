# Changelog — bamakor-dashboard

## [Unreleased] — 2026-05-07

### Superadmin Page (`/superadmin`)

**New files:**
- `app/api/superadmin/stats/route.ts` — GET: returns all clients with aggregate stats (buildings, residents, open tickets, admin email via RPC)
- `app/api/superadmin/client/[id]/route.ts` — PATCH: update client fields (name, plan_tier, WA phone ID, manager phone, SMS sender name). Protected by `x-admin-secret` header.
- `app/api/superadmin/magic-link/route.ts` — POST: generates Supabase auth magic link for any admin email.
- `app/superadmin/page.tsx` — Full UI with lock screen → main table. Features: expandable rows (▶) showing project chips + edit form + magic link; copy buttons on client ID / email / WA Phone ID; green WA status dot; stats bar; "הקם לקוח חדש" button.

**Supabase RPC:** `get_client_admin_emails()` — joins `organization_users → organizations → clients`, returns `{client_id, email}[]`.

---

### WhatsApp Templates Page Redesign (`/settings/whatsapp-templates`)

- `lib/whatsapp-template-keys.ts` — Added `WHATSAPP_TEMPLATE_JOURNEY` (6-step conversation flow array) and `WHATSAPP_TEMPLATE_WHEN_SENT` (per-key description of when each template fires).
- `app/settings/whatsapp-templates/page.tsx` — Full rewrite: accordion UI with inline preview bubble, 6 colored step sections, "שמור הכל" bulk-save, removed old category-based grouping.

---

### Performance: Vercel Region + Supabase Client

- `vercel.json` — Added `"regions": ["hnd1"]` (Tokyo, co-located with Supabase `ap-northeast-1`). Expected ~40ms round-trip reduction vs. default US region.
- `lib/supabase-admin.ts` — Singleton pattern (`_client` module-level variable). Disabled `auth.autoRefreshToken`, `persistSession`, `detectSessionInUrl`. Disabled realtime. Eliminates repeated connection setup on warm lambdas.

---

### Removed: Standalone Pending Residents Page

- `app/pending-residents/page.tsx` — Deleted (`git rm`). Functionality is accessible from the main dashboard sidebar widget.
- `app/components/ui.tsx` — Removed `/pending-residents` from `navItems` and `BOTTOM_NAV_ROUTES`.

---

### SLA Automation & Auto Escalation (`/api/cron/sla-check`)

- `app/api/cron/sla-check/route.ts` — Major rewrite:
  - Runs every 6 hours (`"0 */6 * * *"`)
  - **First alert:** when ticket open ≥ `project.sla_hours` (default 24h) and not yet alerted → sends WA to manager (SMS fallback), records `sla_alerted_at`
  - **Escalation:** 24h after `sla_alerted_at` and `escalated_at IS NULL` → WA/SMS to manager + WA to resident as courtesy update, records `escalated_at`
  - `sendAlert()` helper: tries WA first, SMS fallback, warns on both failures
  - Returns `{ firstAlerts, escalations, wasSent, smsSent }`

**New DB columns on `tickets`:**
- `sla_alerted_at TIMESTAMPTZ`
- `escalated_at TIMESTAMPTZ`

---

### Predictive Alerts

- `lib/predictive-alerts.ts` — New module. `checkAndFlagRecurringIssue()`: if same phone+project has ≥3 tickets in 30 days, sets `is_recurring=true` on the ticket and sends WA/SMS alert to manager.
- `app/api/webhook/whatsapp/route.ts` — After ticket creation, fire-and-forget call to `checkAndFlagRecurringIssue`.

**New DB column on `tickets`:**
- `is_recurring BOOLEAN DEFAULT false NOT NULL`

---

### Preventive Maintenance Cron (`/api/cron/preventive-maintenance`)

- `app/api/cron/preventive-maintenance/route.ts` — New weekly cron (`"0 8 * * 1"`, Monday 08:00 UTC):
  - Analyzes last 30-day ticket window per client → per project
  - **High volume:** ≥5 tickets in 30 days → alert
  - **Repeat reporter:** same phone ≥3 tickets in same project → alert (possible structural issue)
  - **Top keyword:** most frequent non-stop-word ≥3 occurrences → alert
  - Sends consolidated WA or SMS report to manager

---

### AI-Powered WhatsApp Responses

- `lib/whatsapp-ai.ts` — New module using `@anthropic-ai/sdk`:
  - `generateAIWhatsAppResponse(templateText, vars, context?)` → natural Hebrew message
  - Model: `claude-haiku-4-5-20251001`, max 300 tokens
  - System prompt: Hebrew-only, max 4 sentences, preserve ticket details, minimal emoji
  - **Feature-flagged:** only active when `WHATSAPP_AI_ENABLED=true` AND `ANTHROPIC_API_KEY` set in env
  - Always falls back to interpolated template on any error

**To enable:** add `WHATSAPP_AI_ENABLED=true` and `ANTHROPIC_API_KEY=sk-ant-...` to Vercel environment variables.

---

### Tests

**Suite: 4 files, 133 tests — 132 pass, 1 pre-existing failure**

| # | Test File | Status |
|---|-----------|--------|
| 1 | `lib/whatsapp-parser.flow.test.ts` | ✅ 6/6 |
| 2 | `lib/whatsapp-webhook-dedupe.test.ts` | ✅ pass |
| 3 | `tests/whatsapp-webhook.post.test.ts` | ✅ pass |
| 4–7 | `tests/integration/supabase-schema.integration.test.ts` | ✅ 132 pass / ❌ 1 fail |

**Known failure:** `organization_users → organizations → clients resolves end-to-end` — 3 demo/orphan organizations (`נאריו`, `אופסבריין` ×2) have `client_id = NULL`. Not a production issue. Fix: assign or delete those rows.
