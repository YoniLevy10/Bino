# Financy capability map → BINO

Source of truth for “don’t miss an MCP/API capability”.  
Runtime: REST via `lib/bank/financy-gateway.ts`. MCP (`https://mcp.open-finance.ai/mcp`) = agents/dev only.

| MCP / API capability | Gateway method | BINO surface | Owner agent | Status |
|----------------------|----------------|--------------|-------------|--------|
| `list_connections` | `listConnections` → `GET /v2/connections` | Bank overview freshness | FinancyCore / BankUI | ship |
| `get_status` | `getStatus` (rollup from connections) | Connection health | FinancyCore | ship |
| `list_accounts` / `get_account` | `listAccounts` / `getAccount` | Balances | FinancyCore / BankUI | ship |
| `list_transactions` / `get_transaction` | `listTransactions` / `getTransaction` | Transactions journal | FinancyCore / BankUI | ship |
| `list_categories` | `listCategories` | Category labels | FinancyCore | ship |
| `refresh_connections` | `refreshConnections` | Refresh CTA (confirm) | FinancyCore / BankUI | ship |
| `list_providers` | `listProviders` | Transfer bank picker | Transfers | ship |
| `POST /v2/payments` + status | `createPayment` / `getPaymentStatus` | Transfers tab | Transfers | ship |
| Merchants / payees | `listMerchants` / `createMerchant` | Payee picker + save on Transfers | Transfers | live |
| `list_integrations` / `get_integration` | `listIntegrations` / `getIntegration` | Books connected (soft-fail) | BooksBridge | live |
| `get_receivables` | `getReceivables` | Who owes (structured) | BooksBridge / Collections | live |
| `list_invoicing_documents` / get | `listInvoicingDocuments` / `getInvoicingDocument` | Document archive | BooksBridge | live |
| `list_invoicing_customers` / get | `listInvoicingCustomers` / `getInvoicingCustomer` | Customer cards | BooksBridge | live |
| drafts + proposals | `draftInvoice` / `listProposals` / `getProposal` | Prepare receipt → Financy approve | BooksBridge / Collections | live |
| `list_clearing_settlements` | `listClearingSettlements` | Clearing section | BooksBridge | live |
| `list_card_transactions` | `listCardTransactions` | Clearing section | BooksBridge | live |

Bank/books connections are created only in [Financy Settings](https://financy.open-finance.ai/settings) — **no API creates bank links**, and Financy **never** returns `clientSecret` to third-party apps after a bank connect (no OAuth handoff).  

Per BINO tenant (required 2nd step): paste Settings → API access keys (`clientId` / `clientSecret` / `userId`, paid plan) into `FinancyConnectCard` → `POST /api/building-finance/bank/connect` verifies via `listConnections`, stores `clients.financy_*`, then sync opens the bank screen.

**Scope:** bank is **client/business-wide** (one Financy connection for all buildings under the tenant). `project_id` on bank_* tables stays nullable for optional tagging later — UI/sync do not filter by building.

## Reserved migrations

| Number | Purpose | Owner |
|--------|---------|-------|
| 143 | `clients.financy_*` + `bank_accounts` + `bank_transactions` + `bank_transfers` | FinancyCore (this PR stream) |

Do not reuse 137–142 (already taken by other features).
