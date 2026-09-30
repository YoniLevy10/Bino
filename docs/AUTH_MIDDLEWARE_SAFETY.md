# Auth / middleware / login safety

> **Agents:** the binding checklist is the always-apply Cursor rule  
> [`.cursor/rules/auth-middleware-login-safety.mdc`](../.cursor/rules/auth-middleware-login-safety.mdc)  
> and the short section in [`CLAUDE.md`](../CLAUDE.md). This doc is the human-readable incident record.

## What happened (2026-09-30)

After merges that moved middleware tenant resolution onto the **session JWT** (anon + user cookie), production flooded with:

```text
[middleware] tenant resolution transient failure — keeping session
[Error: CLIENTS_ACTIVE_QUERY_FAILED: permission denied for table clients]
```

Managers could not complete login / navigate reliably. Authenticated APIs returned **503**.

### Root cause

1. Migration `078_rls_security_hardening.sql` granted `authenticated` **column-level** SELECT on `clients` but **omitted** `is_active`.
2. `listClientIdsForUserId` filters with `.eq('is_active', true)`.
3. Under the session role that filter fails at the Postgres privilege layer (`permission denied for table clients`), not as an empty RLS result.
4. Middleware treated it as a hard failure → login/nav broken for everyone.

### Fix

- Production GRANT: `116_grant_clients_is_active_select.sql`
- Code: middleware restored `getSupabaseAdmin()` for tenant/nav resolve; soft fallback on permission-denied in `listClientIdsForUserId` (#190)

## Why this is business-critical

A single middleware/GRANT mismatch locks **every** management company out of BINO. It is worse than a feature bug: the product appears up (HTTP 200 pages) while authz is dead.

## Recurrence prevention

Follow the always-apply rule. In short:

| Do | Don't |
|----|--------|
| Service role for middleware tenant chain | Session JWT for `clients` / org resolve in middleware |
| GRANT every column you filter as `authenticated` | Add `.eq('is_active', …)` without GRANT |
| Separate PR + login smoke for auth/middleware | Bundle into perf/UI PRs |
| Treat `CLIENTS_ACTIVE_QUERY_FAILED` as P0 | Ignore as “transient” |

## Related files

- `middleware.ts`
- `lib/tenant-resolution.ts`
- `lib/middleware-tenant-cache.ts`
- `supabase/migrations/078_rls_security_hardening.sql`
- `supabase/migrations/116_grant_clients_is_active_select.sql`
