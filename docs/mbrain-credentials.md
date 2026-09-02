# Levy Marketing Brain — Credentials & environment

Copy into Vercel / `.env.local`. Secrets never ship to the browser.

## Required (shared with Bamakor)

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser/auth anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server admin (API routes only) |
| `NEXT_PUBLIC_APP_URL` | Public app URL |
| `CRON_SECRET` | Authorize `/api/cron/mbrain-*` |

## Marketing Brain — AI (cost-first defaults)

| Variable | Example | Notes |
|----------|---------|-------|
| `AI_PROVIDER` | `local` | `local` \| `openai_compatible` \| `openai` \| `gemini` |
| `LOCAL_AI_BASE_URL` | `http://127.0.0.1:11434/v1` | Ollama / llama.cpp / vLLM OpenAI-compatible base |
| `LOCAL_AI_MODEL` | `llama3.1` | Model id on local server |
| `LOCAL_AI_API_KEY` | `ollama` | Optional; some servers require a dummy key |
| `OPENAI_API_KEY` | — | Only if `AI_PROVIDER=openai` |
| `OPENAI_MODEL` | `gpt-4.1-mini` | Only if using OpenAI |
| `GEMINI_API_KEY` | — | Only if `AI_PROVIDER=gemini` |
| `IMAGE_PROVIDER` | `template` | `template` \| `local` \| `openai` |
| `LOCAL_IMAGE_BASE_URL` | — | Self-hosted image API when `IMAGE_PROVIDER=local` |

**Dev zero-cost:** `AI_PROVIDER=local` + `IMAGE_PROVIDER=template` (no paid tokens).

## Marketing Brain — Meta

| Variable | Where to get it | Notes |
|----------|-----------------|-------|
| `META_MODE` | `mock` or `live` | UI labels mock vs live data |
| `META_GRAPH_API_VERSION` | e.g. `v21.0` | Centralized; override when Meta publishes newer |
| `META_APP_ID` | [Meta for Developers](https://developers.facebook.com/) → App → Settings → Basic | Marketing API app |
| `META_APP_SECRET` | Same | Server only |
| `META_OAUTH_REDIRECT_URI` | `{APP_URL}/api/mbrain/meta/oauth/callback` | Must match app settings |
| `MBRAIN_TOKEN_ENCRYPTION_KEY` | 32-byte hex / base64 secret | Encrypts stored Meta tokens at rest |

### How to obtain Meta credentials

1. Create a Meta Developer App with **Marketing API**.
2. Add Facebook Login / Business Login products as required.
3. Request permissions: `ads_management`, `ads_read`, `business_management`, `pages_show_list`, `pages_read_engagement`, `instagram_basic` (as needed).
4. For live spend: ad account must be in a Business Manager you administer; App Review may be required for production users beyond test users.
5. Until credentials exist: keep `META_MODE=mock` — architecture still supports live calls; Integrations UI shows setup status.

## Optional cost / ops

| Variable | Purpose |
|----------|---------|
| `MBRAIN_COST_CURRENCY` | `ILS` default for cost dashboard display |

## Modes cheat-sheet

```bash
# Local development (no paid AI, no Meta spend)
AI_PROVIDER=local
IMAGE_PROVIDER=template
META_MODE=mock

# Production Meta (after OAuth connected)
META_MODE=live
META_GRAPH_API_VERSION=v21.0
```
