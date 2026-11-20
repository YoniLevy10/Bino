# BINO Open Platform — Partner API + MCP (direction)

**Status:** P0 design. No Partner API or BINO MCP server shipped yet.  
**Product gate:** surfaces must deepen operational memory, automate decisions, or prove savings — not generic ticket CRUD.

## Why

BINO should be a connectable platform (REST + MCP) for agents, partners, and large tower operators — not a closed legacy ops system. Openness is a distribution wedge: external stacks call BINO for *judgment* (who to send, what is recurring, what will fail).

## Surfaces (phased)

| Phase | Deliverable |
|-------|-------------|
| **P1** | Read-only Partner API under `/api/v1/*`, API keys bound to one `client_id`, scopes + rate limits + audit |
| **P2** | Official BINO MCP server wrapping the same services (decision-oriented tools) |
| **P3** | Webhooks + limited writes (assign / external ticket create with provenance) |
| **P4** | Public developer docs + tower narrative (Dubai / NY) |

## P1 endpoints (proposed)

| Path | Scope | Intent |
|------|-------|--------|
| `GET /api/v1/health` | — | Liveness |
| `GET /api/v1/buildings` | `buildings:read` | Sanitized building list |
| `GET /api/v1/ops/memory` | `ops:read` | Tenant ops snapshot |
| `GET /api/v1/ops/briefing` | `ops:read` | Heuristic priorities |
| `GET /api/v1/kpis/north-star` | `kpis:read` | Time-to-assign/resolve, recurring, SLA proxies |
| `GET /api/v1/signals` | `signals:read` | Management recommendations |
| `GET /api/v1/tickets/{id}/recommend-assignee` | `recommend:read` | Worker suggestion (no auto-assign) |
| `GET /api/v1/tickets/summary` | `tickets:read` | Bounded counts + capped sample |

## MCP tools (proposed, P2)

`get_building_ops_memory`, `get_ops_briefing`, `get_savings_kpis`, `list_decision_signals`, `list_sla_risks`, `explain_recurring_failure`, `recommend_assignee`, `list_buildings`, `get_ticket_ops_context`.

## Auth (non-negotiable)

- Partner calls: hashed API key → bound `client_id` → `getSupabaseAdmin()` + explicit tenant filter.
- **Never** resolve partner tenant from session JWT (same class of risk as middleware auth incidents).
- Middleware may bypass session for `/api/v1/*` like `/api/public/*`; handlers enforce the key.
- No paid Supabase preview branches or billable Vercel add-ons for sandbox without owner approval.

## Reuse from today’s codebase

- Ops memory: `lib/ops-context/tenant-snapshot.ts`, `synthesize-briefing.ts`
- Recommend assignee: `lib/recommendations/suggest-worker*.ts`
- Signals: `app/api/recommendations` + `management_recommendations`
- North-star math: tenant-scoped port of `lib/ops/ops-intelligence-slices.ts` (not superadmin cross-tenant report)
- Rate limit + audit: `lib/shared/rate-limit.ts`, `lib/audit.ts`

## Defaults if GTM decisions are open

1. **Audience:** AI agent platforms + Israeli management partners first; international towers as design narrative.  
2. **MCP host:** Cursor-first.  
3. **Commercial:** free rate-limited read keys for demos; paid tier when writes/webhooks exist.

## Out of scope for first ship

WhatsApp/SMS send, Grow/Financy via MCP, cross-tenant partner analytics, unauthenticated data, sales-lead auto outreach.
