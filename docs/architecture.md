# Levy Marketing Brain — Architecture

**Product:** AI Marketing Operator (not a chatbot wrapper)  
**First brand/tenant:** במקור / Bamakor  
**Host application:** Shared Next.js repo with Bamakor Dashboard (preserved intact)

---

## 1. Repository audit outcome

| Finding | Decision |
|---------|----------|
| Repo is **Bamakor Dashboard** (property-management SaaS), not a greenfield app | **Preserve** all existing Bamakor routes, schema, WhatsApp/SMS, collections |
| Existing `organizations` / `clients` model = Bamakor tenants | Marketing Brain uses a **separate** multi-tenant model (`mbrain_*`) |
| Routes `/campaigns`, `/settings`, `/` already used by Bamakor | Marketing Brain lives under **`/brain/*`** and **`/api/mbrain/*`** to avoid collisions |
| Stack already matches target: Next.js 16, React 19, Supabase, Zod, Vitest, Vercel | Reuse shared auth (Supabase Auth), admin client, fetch helpers, cron pattern |
| `@anthropic-ai/sdk` already present (WhatsApp agent) | Marketing Brain uses **provider abstractions**; default = local/OpenAI-compatible |

Future option: deploy Marketing Brain on a dedicated domain with rewrite `/ → /brain`.

---

## 2. System architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Hebrew RTL UI  /brain/*  (executive cockpit)               │
│  dashboard · brands · strategy · campaigns · creatives ·    │
│  performance · approvals · ai-operator · settings           │
└───────────────────────────┬─────────────────────────────────┘
                            │ server-only
┌───────────────────────────▼─────────────────────────────────┐
│  API / Server Actions  /api/mbrain/*                        │
│  Auth → Org membership → Zod → Guardrails → Domain services │
└───────┬─────────────┬─────────────┬─────────────┬───────────┘
        │             │             │             │
   ┌────▼────┐  ┌─────▼─────┐ ┌────▼────┐  ┌─────▼──────┐
   │ Agents  │  │ Meta      │ │ Image   │  │ Deterministic│
   │ tools   │  │ Adapter   │ │ + HTML  │  │ metrics/rules│
   └────┬────┘  └─────┬─────┘ └────┬────┘  └─────┬──────┘
        │             │            │             │
   ┌────▼─────────────▼────────────▼─────────────▼──────┐
   │  PostgreSQL (Supabase) + Storage + RLS             │
   │  mbrain_* tables · performance snapshots · audit   │
   └────────────────────────────────────────────────────┘
```

**Principle:** Cursor builds the app; the **deployed app** is the runtime marketing operator.

---

## 3. Database model (multi-tenant)

All Marketing Brain tables are prefixed `mbrain_` in `public` to avoid colliding with Bamakor.

### Tenant core
- `mbrain_organizations` — agency / operator account
- `mbrain_organization_members` — user ↔ org + role (`owner` | `admin` | `analyst` | `viewer`)
- `mbrain_brands` — advertised businesses (Bamakor first)
- `mbrain_brand_profiles` — Brand Brain JSON (ICP, voice, pains, …)
- `mbrain_brand_assets` — logos, screenshots, product images (Storage paths)

### Planning & creative
- `mbrain_marketing_objectives`
- `mbrain_strategies` — Zod-validated structured strategy JSON
- `mbrain_campaign_plans`
- `mbrain_marketing_hypotheses` — testable angles (not assumed truths)
- `mbrain_creatives` / `mbrain_creative_variations`
- `mbrain_landing_pages` — URL registry (Phase 1); builder later

### Meta & execution
- `mbrain_meta_connections` — encrypted tokens server-side only
- `mbrain_meta_accounts` — ad account / page / IG / pixel selections
- `mbrain_campaigns` / `mbrain_ad_sets` / `mbrain_ads` — internal UUIDs + `meta_external_id`
- Idempotency keys on launch operations

### Safety & ops
- `mbrain_spending_guardrails` — org + brand + campaign levels
- `mbrain_approvals` — who/what/when/budget/payload
- `mbrain_automation_rules`
- `mbrain_optimization_recommendations`
- `mbrain_performance_snapshots` — historical Insights (source of truth for dashboard)
- `mbrain_leads` — statuses: `new` | `qualified` | `demo_booked` | `customer` | `disqualified`
- `mbrain_agent_runs` / `mbrain_agent_actions` / `mbrain_audit_logs`
- `mbrain_cost_events` — AI/API cost tracking (target ≈ 0)

**RLS:** every row scoped by `organization_id`; members only see their org. Service role used in API routes after membership checks (same pattern as Bamakor).

---

## 4. Meta integration

```
lib/mbrain/meta/
  client.ts      — Graph API base, version config, retries
  auth.ts        — OAuth / token refresh (server-only)
  accounts.ts    — businesses, ad accounts, pages, IG, pixels
  campaigns.ts
  adsets.ts
  creatives.ts
  ads.ts
  insights.ts
  errors.ts
  types.ts
```

- Centralize Graph API version: `META_GRAPH_API_VERSION` (no hardcoded obsolete version).
- Modes: `META_MODE=mock | live`. UI must label **MOCK DATA** vs **LIVE META DATA**.
- Official Marketing/Graph APIs only — no unofficial browser automation for ads.
- LLM never constructs arbitrary Meta HTTP; only typed tools (`createCampaignDraft`, `requestCampaignLaunch`, …).

---

## 5. Agent architecture

Logical modules (same process, tool-calling orchestration — not microservices):

| Module | Role |
|--------|------|
| Marketing Director | Orchestrates objective → plan |
| Research | Website / brand context (ingestion hooks) |
| Strategy | Structured Campaign Plan (Zod) |
| Copywriter | Hypothesis-linked ad copy |
| Creative Director | Template creatives + optional generative images |
| Campaign Builder | Plan → Meta draft objects |
| Performance Analyst | Reads **stored** metrics only |
| Optimization | Deterministic rules + AI explanation |

**Cost rule:** CPL/CTR/spend/guardrails = **code**. LLM = reasoning, copy, interpretation.

### Provider abstractions
```
LLMProvider · ImageGenerationProvider · EmbeddingProvider · VisionProvider
→ Local (OpenAI-compatible) · OpenAICompatible · OpenAI · Gemini (optional)
```

Default: `AI_PROVIDER=local`, `IMAGE_PROVIDER=template|local`.

---

## 6. Approval & guardrails

**Never** let an LLM spend unbounded money.

Default autonomy: **SUPERVISED** (`MANUAL` | `SUPERVISED` | `AUTONOMOUS`).

Requires approval by default:
- Launch campaign
- Increase budget
- Change geography
- Raise max total spend
- Material objective change

Backend **rejects** violations even if AI requests them. Approvals store actor, payload, budget, timestamp.

Guardrails examples: `monthly_spend_limit`, `daily_spend_limit`, `max_campaign_daily_budget`, `max_budget_increase_percentage`, `max_cpl`, `minimum_data_before_optimization`, `auto_pause_enabled`.

---

## 7. Security model

- All Meta / AI secrets server-side only
- Encrypted storage for Meta tokens
- Verify org membership on every action
- RLS prevents cross-tenant reads
- Validate AI tool args with Zod server-side
- Never log access tokens
- Audit every agent action

---

## 8. Implementation phases

| Phase | Scope |
|-------|--------|
| **A** | Foundation: auth path, orgs, brands, Brand Brain shell, Bamakor seed, `/brain` UI shell |
| **B** | Objectives + strategy generation (structured Zod) |
| **C** | Copy + template creatives + image provider interface |
| **D** | Meta connection + account discovery |
| **E** | Campaign plan → Meta draft + preview |
| **F** | Approval engine → launch + idempotency |
| **G** | Insights cron + dashboard persistence |
| **H** | Performance Analyst |
| **I** | Optimization rules + supervised automation + cost dashboard |

Definition of done = end-to-end Bamakor lead-gen workflow in §33 of the product brief.

---

## 9. Cost-first defaults

| Concern | Choice |
|---------|--------|
| Metrics / guardrails | Deterministic TypeScript |
| Creatives (primary) | HTML/CSS/Canvas template engine (near-zero cost) |
| LLM | OpenAI-compatible local endpoint (Ollama / llama.cpp / vLLM) |
| Images | Template first; self-hosted image API optional; paid APIs last |
| Meta ads spend | **Accepted** variable cost (the product’s purpose) |
| Agent frameworks | Avoid heavy frameworks; simple tool orchestration |

See `docs/open-source-evaluation.md`.

---

## 10. Environment modes

```
AI_PROVIDER=local|openai_compatible|openai|gemini
LOCAL_AI_BASE_URL=http://127.0.0.1:11434/v1
LOCAL_AI_MODEL=…
IMAGE_PROVIDER=template|local|openai
META_MODE=mock|live
META_GRAPH_API_VERSION=v21.0   # override via env; never hardcode obsolete
```

Zero-cost development: local AI + template images + Meta mock, fully testable without paid tokens.
