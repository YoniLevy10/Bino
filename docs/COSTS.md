# COSTS.md — Growth Operating System

**Principle:** The only meaningful recurring variable expense should be **Meta advertising spend**.  
Software/AI cost target ≈ 0 whenever practical.

---

## Mandatory / already in use

| Service | Purpose | Free tier | Est. cost | OSS alternative | Mandatory? |
|---------|---------|-----------|-----------|-----------------|------------|
| Vercel | Host Next.js | Hobby limited | Existing Bamakor plan | Self-host Node | Yes (current) |
| Supabase | DB / Auth / Storage | Free tier exists | Existing project | Self-host Postgres | Yes (current) |
| Meta Ads | Paid acquisition | N/A | **Media budget (intended)** | None compliant | Yes for paid growth |

---

## Optional (introduce only when Phase needs them)

| Service | Purpose | Free tier | Est. cost | OSS alternative | Mandatory? |
|---------|---------|-----------|-----------|-----------------|------------|
| Ollama / llama.cpp | Strategy/copy/analysis LLM | Self-host | Electricity / optional GPU | — | Preferred AI |
| OpenAI / Anthropic / Gemini | LLM fallback | Trial credits | Pay-per-token | Local models | No — last resort |
| fal.ai / OpenAI Images | Generative ads | Limited | Per image | Templates + ComfyUI | No — templates first |
| Resend | Outbound / ops email | Free tier | Low | SMTP | Phase 2 optional |
| Tavily / search APIs | Lead discovery | Limited free | Per query | Direct public fetch + Maps | Prefer public first |
| Apollo / Prospeo | Email enrichment | Paid | Per credit | Manual/public only | **Avoid by default** |
| GoMarble MCP | Multi-platform ads agent | Paid SaaS | Subscription | Our Meta adapter + rules | **Do not use** |
| meta-ads-mcp Cloud Run | MCP Meta server | Self-host compute | Always-on $ | Our `lib/mbrain/meta` | **Do not deploy** |
| PhantomBuster / LinkedIn bots | LinkedIn automation | Paid | High + ban risk | Manual tasks only | **Forbidden** |

---

## Cost dashboard categories (schema already: `mbrain_cost_events`)

Track:
- `meta_ads` — advertising spend (from Insights)
- `ai_llm` — inference
- `ai_image` — generation
- `external` — enrichment/search
- `infra` — optional attributed hosting

UI target: Advertising Spend · AI/API Cost · Infra · Total.

---

## Decision log

| Choice | Rationale |
|--------|-----------|
| Keep custom Meta adapter | Already built; MCP adds Firestore+process without product gain |
| No license-less outreach-agent code | Legal risk; concepts only |
| Hook methodology as TS rules | MIT concepts without Claude SDK lock-in |
| Lead discovery public-first | Avoid enrichment SaaS until conversion proves ROI |
