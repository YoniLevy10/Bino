# Collections path prep (no apply / no real charges) — 2026-10-03

| Item | Status | Notes |
|------|--------|-------|
| Migration 113 | **Not applied** — held | Column `idempotency_key` still absent; create without header works |
| Concurrent idempotency plan | Ready | After 113: two parallel POSTs with same `Idempotency-Key` → one row |
| Grow webhook harden | **Deployed** (#235) | Needs sandbox E2E confirmation |
| False-success toasts | **Deployed** (#232) | |
| D3 sim-tx / audit-tx | **Test data** | No Approve / status change |
| Invoice E2E | Blocked | Needs Grow sandbox + invoice webhook observation |

**No new approval to apply 113 or run real charges in this cycle.**
