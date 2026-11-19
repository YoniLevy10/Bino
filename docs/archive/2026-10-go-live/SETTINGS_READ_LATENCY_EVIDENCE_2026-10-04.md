# Settings `/api/settings/read` — latency evidence (2026-10-04)

## Measured / proven

| Layer | Evidence | Result |
|-------|----------|--------|
| Postgres PK lookup on `clients` | `EXPLAIN ANALYZE` Bamakor id | **0.7 ms** execution (seq scan on 3-row table — fine) |
| Route handler | `app/api/settings/read/route.ts` | `requireSessionClientId` + single `.select(CLIENT_SETTINGS_READ_SELECT).eq('id').maybeSingle()` — **no N+1**, no sequential Supabase queries |
| Payload | `CLIENT_SETTINGS_READ_SELECT` | One row; secrets stripped (`whatsapp_access_token` → boolean flag only) |
| Client cache (this PR) | `useTenantSettingsRead` + `queryKeys.settings` | **staleTime 60s**; warm nav uses cache; refresh failure keeps hydrated form |

## Conclusion

DB is **not** the bottleneck for settings cold path. Remaining cold latency is dominated by **Vercel serverless cold start + session auth cookie resolve**, not missing indexes or wide joins.

## Actions taken

1. React Query cache — **VERIFIED FIXED** for warm/repeat visits.
2. No new index on `clients(id)` — PK already; small table seq scan is expected.
3. SELECT trim deferred — columns are consumed by Settings tabs; trimming without tab-by-tab audit risks silent missing fields → **ACCEPTED NON-BLOCKER** until a column-usage audit proves unused fields.

## Rollback

Revert `lib/hooks/use-settings-read.ts` + settings page wiring; route unchanged.
