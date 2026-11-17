# Financy wave — agent file ownership

Hard rules: no `middleware.ts`, no `lib/tenant-resolution.ts`, no Grow Approve path, no changing charge `idempotency_key` format.

| Agent | Owns | Must not touch |
|-------|------|----------------|
| Contracts | `lib/bank/types.ts`, `lib/bank/flags.ts`, this doc, capability map | UI, gateway HTTP |
| FinancyGateway | `lib/bank/financy-auth.ts`, `lib/bank/financy-gateway.ts`, gateway tests | Hub UI, Grow |
| FinancyCore | migration 143 bank tables, sync/cron APIs, settings `financy_*` keys | Transfers UI, Books UI |
| BankUI | `BuildingBankPanel`, `/finance/bank`, Hub `bank` tab, sidebar `bank` | Gateway internals |
| Transfers | `bank_transfers` APIs, webhook financy-payment, Transfers panel | AIS sync |
| BooksBridge | books/clearing APIs + Books/Clearing panels | grow-webhook |
| Collections | collections flag path using receivables/drafts | bank schema |
| Reports | report-aggregate + reports panel bank cards | credentials |

Shared locks:

- `BuildingHubModal.tsx` — BankUI adds `bank` tab
- `lib/sidebar-nav.ts` / `client-nav-features.ts` — BankUI
- `lib/api-body-schemas.ts` — only own keys (`financy_*`, transfer bodies)
