# Open-source evaluation — Levy Marketing Brain

Evaluations performed before introducing paid AI/SaaS dependencies. Goal: keep recurring software cost near zero; Meta ad spend is the intentional variable cost.

---

## 1. LLM inference (OpenAI-compatible)

### Candidate A — Ollama
| Field | Value |
|-------|--------|
| Repository | https://github.com/ollama/ollama |
| Purpose | Local model runner + OpenAI-compatible HTTP API |
| License | MIT |
| Stars | ~150k+ (high adoption) |
| Last update | Actively maintained |
| Stack | Go + llama.cpp backends |
| Reuse | Dev/default `AI_PROVIDER=local` via `LOCAL_AI_BASE_URL` |
| Do not reuse | Embed Ollama inside Next.js; keep as external process |
| Security | Bind localhost; never expose without auth |
| Infra | CPU/GPU workstation; no always-on GPU required for MVP |
| Effort | Low (URL + model env vars) |
| **Recommendation** | **Adopt as default local provider** for strategy/copy/analysis |

### Candidate B — llama.cpp (`llama-server`)
| Field | Value |
|-------|--------|
| Repository | https://github.com/ggerganov/llama.cpp |
| Purpose | Portable GGUF inference + OpenAI-compatible server |
| License | MIT |
| Maintenance | Very active |
| Reuse | Production-ish CPU / low-cost hosting |
| **Recommendation** | **Supported** via same OpenAI-compatible client |

### Candidate C — vLLM
| Field | Value |
|-------|--------|
| Repository | https://github.com/vllm-project/vllm |
| Purpose | High-throughput GPU serving |
| License | Apache-2.0 |
| Infra | Needs serious GPU; higher monthly cost if always on |
| **Recommendation** | **Defer** until concurrent load justifies GPU spend |

### Paid APIs (OpenAI / Anthropic / Gemini)
| Field | Value |
|-------|--------|
| Purpose | Optional fallback when local quality insufficient |
| **Recommendation** | Priority 5 only; implement behind `LLMProvider`; document cost if enabled |

---

## 2. Image generation

### Candidate A — Template / composition engine (first choice)
| Field | Value |
|-------|--------|
| Repository | N/A (build thin in-house) |
| Purpose | Screenshot + logo + headline + CTA → 1:1 / 4:5 / 9:16 ads |
| License | Our code |
| Cost | ~0 |
| **Recommendation** | **Primary creative path for MVP** |

### Candidate B — ComfyUI (self-hosted API)
| Field | Value |
|-------|--------|
| Repository | https://github.com/comfyanonymous/ComfyUI |
| Purpose | Node-based diffusion workflows + HTTP API |
| License | GPL-3.0 (app calling remotely is fine; do not vendor GPL into our MIT/proprietary tree) |
| Model licenses | **Separate** — must pick commercial-ok weights (e.g. SDXL community, Flux Schnell where permitted) |
| Infra | GPU required for quality; not free at scale |
| **Recommendation** | Optional `ImageGenerationProvider` later; **do not** default-require GPU |

### Candidate C — OpenAI Images API
| Field | Value |
|-------|--------|
| Purpose | High-quality text-to-image |
| Cost | Paid per image |
| **Recommendation** | Optional provider only after templates + local option |

---

## 3. Meta Marketing API

### Candidate A — Thin Graph fetch adapter (chosen)
| Field | Value |
|-------|--------|
| Purpose | Typed wrapper around official Graph Marketing API |
| License | Our code |
| Why | Official SDK is heavy / weakly typed; we need central versioning, mock mode, idempotency, no token logging |
| **Recommendation** | **Build `lib/mbrain/meta/*`** ourselves |

### Candidate B — facebook-nodejs-business-sdk
| Field | Value |
|-------|--------|
| Repository | https://github.com/facebook/facebook-nodejs-business-sdk |
| License | Meta Platform License |
| Stars | ~600 |
| Concerns | Autogen bulk, TypeScript quality, hard to mock cleanly |
| **Recommendation** | **Do not depend** for MVP; may reference field names |

### Candidate C — @openpromo/meta / promobase
| Field | Value |
|-------|--------|
| Repository | https://github.com/promobase/ad-platform-sdks |
| License | MIT |
| Stars / maturity | Early; low download volume |
| Concerns | Young dependency controlling core money path |
| **Recommendation** | **Watch**; not integrate yet (Frankenstein / lock-in risk) |

**Hard rule:** Meta ads use **official APIs only** — no unofficial browser automation for campaign spend.

---

## 4. Agent orchestration

### Candidate — Heavy frameworks (LangGraph, CrewAI, AutoGen, …)
| Field | Value |
|-------|--------|
| Purpose | Multi-agent graphs |
| Concerns | Complexity, opacity, cost abstractions, harder auditability |
| **Recommendation** | **Reject for MVP**. Marketing Director = our orchestrator + typed tools + Zod |

---

## 5. Analytics / dashboards / attribution

| Need | Decision |
|------|----------|
| KPI calculations | In-house TypeScript over `mbrain_performance_snapshots` |
| Charts | Lightweight React + existing Tailwind; no paid BI |
| Attribution / experimentation platforms | Defer; schema ready for lead quality |

---

## Summary decisions (reversible)

1. **LLM:** OpenAI-compatible local (Ollama first) → paid optional.
2. **Creatives:** Template engine first → generative image providers optional.
3. **Meta:** Official Graph via our adapter + mock/live modes.
4. **Agents:** Simple tool orchestration, not a framework.
5. **No Frankenstein:** Prefer small owned modules over gluing many platforms.
