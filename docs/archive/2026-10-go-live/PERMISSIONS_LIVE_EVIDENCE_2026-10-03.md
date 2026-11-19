# Live API permissions evidence (2026-10-03)

**Users:** `bino-wa-manager@bino.casa` (manager) · `bino-wa-viewer@bino.casa` (viewer)  
**Tenant:** BINO Sandbox `a1111111-1111-4111-8111-111111111111`  
**Foreign tenant ticket (Bamakor):** `42fc65a0-3d04-4424-ab8b-8d62d280c69a`  
**Prod:** `https://bino.casa` @ `edd27bb` / `dpl_68zCkLfqbhF8z4PGck5TG2GvUHx9`

Session cookies built from password grant; mutating routes use `requireSessionWriteAccess` + `getSupabaseAdmin()` (service role).

## Viewer — must not mutate (service-role API)

| Route | Status | Body |
|-------|--------|------|
| `POST /api/recommendations/dismiss` | **403** | `VIEWER_READ_ONLY` |
| `POST /api/update-ticket` (sandbox) | **403** | `VIEWER_READ_ONLY` |
| `POST /api/update-ticket` (Bamakor id) | **403** | `VIEWER_READ_ONLY` |
| `POST /api/assign-ticket` | **403** | `VIEWER_READ_ONLY` |
| `POST /api/settings/update` | **403** | `VIEWER_READ_ONLY` |
| `POST /api/attendance/shifts` | **403** | `VIEWER_READ_ONLY` |

## Manager — allowed on own tenant; blocked cross-tenant

| Route | Status | Notes |
|-------|--------|------|
| `POST /api/update-ticket` sandbox `#4` | **200** | status → `IN_PROGRESS` |
| `POST /api/update-ticket` Bamakor `#249` | **404** | `Ticket not found` (client_id filter) |
| `POST /api/assign-ticket` Bamakor | **404** | Ticket not found |
| `POST /api/settings/update` | **200** | sandbox only |
| `POST /api/attendance/shifts` | **403** | `ADDON_REQUIRED` (not a write-role bypass) |

## PostgREST (JWT) after Window A REVOKE

| Action | Manager | Viewer |
|--------|---------|--------|
| INSERT/UPDATE tickets | **403** permission denied | **403** |
| SELECT Bamakor ticket by id | **200 []** | **200 []** |

## Two organizations

Sandbox org users have **no** membership on Bamakor. Cross-org mutation via service-role APIs returns **404** (not found in caller’s `clientId`). Cross-org PostgREST read returns empty under RLS.

Raw results: `/tmp/perms-live/results.json` (agent workspace).
