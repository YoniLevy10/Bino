# `lib/` layout — move map and shim rules

Companion to [ARCHITECTURE.md](./ARCHITECTURE.md). Used during deluxe organization.

## Shim rules

When moving `lib/foo.ts` → `lib/<domain>/foo.ts` (basename kept):

1. Leave a **thin** compat file at the old path only while imports still use the old module id:

```ts
/** @deprecated Compat shim — import from `@/lib/<domain>/foo` instead. */
export * from './<domain>/foo'
```

2. Shims must contain **only** that re-export (plus optional one-line comment). No logic.
3. Prefer updating imports to the new path in the same change set, then **delete** the shim.
4. Do not create shims for `*.test.ts` — move tests next to implementation.
5. Validate: `node scripts/check-lib-shims.mjs`
6. Bulk rewrite + delete: `node scripts/migrate-lib-shim-imports.mjs`
7. Fold helper: `node scripts/fold-lib-domain.mjs --domain <name> --glob '<pat>'`

## Files forbidden to refactor-in-place in the same PR as a move

- `middleware.ts` (logic)
- Tenant resolution / supabase client **behavior** changes
- RLS / GRANT migrations

Move+shim only is OK for tenant/auth-api; any logic change needs its own PR + login smoke.

## Domain folders (current)

| Directory | Contents |
|-----------|----------|
| `whatsapp/` | Outbound/inbox helpers, Meta template specs (`whatsapp-*`, `wa-*`, `meta-whatsapp-*`) |
| `whatsapp-webhook/` | Inbound webhook pipeline (`dispatch-inbound`, `inbound-media`, `inbound-session`, …) |
| `whatsapp-ai-chat/` | Tenant AI chat gate/run |
| `tickets/` | Ticket helpers + `create-ticket-service` |
| `collections/` | Vaad / collection charges |
| `payments/` | Grow + iCount |
| `bank/`, `bank-match/` | Financy bank + matching |
| `building-finance/`, `building-governance/` | Building money + decisions |
| `attendance/`, `nfc/` | Attendance + NFC stamp |
| `maintenance/` | Recurring maintenance tasks |
| `worker/` | Field worker portal helpers |
| `tenant/` | Tenant resolution, caches, middleware tenant helpers, canonical host |
| `auth-api/` | `api-auth`, `request-user`, org roles |
| `shared/` | fetch timeouts, viewport, urls, logging, rate-limit, … |
| `client/` | Client settings/nav/launch |
| `residents/` | Intake, import, residents WhatsApp |
| `resident-portal/` | Portal membership / OTP |
| `recommendations/`, `ops/`, `ops-context/` | Ops memory / intelligence |
| `sms/`, `push/`, `reporter/`, `notify/` | Messaging side-effects |
| `dashboard/`, `summary/`, `calendar` utils via root/`google/` | Manager surfaces |
| `excel/`, `projects/`, `plans/`, `addons/` | Imports, billing addons |
| `marketing/`, `seo/` | Public site |
| `palgate/`, `sales-leads/`, `midrag/`, `fixly/` | Pilots / integrations |
| `composio/`, `superadmin/`, `sandbox/`, `errors/`, `hooks/` | Platform helpers |

## Stay at `lib/` root (cross-cutting)

Examples: `database.types.ts`, `api-body-schemas.ts`, `supabase.ts`, `supabase-admin.ts`, `supabase-route-handler.ts`, plus a short list of unmapped single modules. Hygiene target: **about 80 or fewer** `.ts` files directly under `lib/`.

## Practical root-file goal

After folds + shim cleanup: **fewer than ~80** TypeScript files directly under `lib/` (core + remaining unmapped). Not a hard CI gate — a hygiene target.
