# Window A apply evidence — 2026-10-03

**Project:** Bamakor `jsliqlmjksintyigkulq` · **Org plan:** Pro (PITR)  
**Status:** Window A **applied** · Window B / 113 **not** applied  
**Tip migrations:** `window_a_system_logs`, `112_audit_projects_soft_delete`, `111_audit_whatsapp_phone_unique_and_rls_writes`, `121_revoke_worker_nfc_attendance_writes`

---

## 0. Backup gate (before DDL)

| Check | Evidence |
|-------|----------|
| Org plan | Levy Tech1 / **Pro** (`tier_pro`) — PITR included |
| WAL archive | `archive_mode=on`, `archive_command=/usr/bin/admin-mgr wal-push %p …` (wal-g) |
| As-of | `2026-10-03 18:44:22+00` (pre-apply precheck) |
| Restore path | Supabase Dashboard → Project Bamakor → **Database → Backups → Point-in-time recovery** → choose timestamp **before** `2026-10-03 18:47:06Z` (first Window A migration) → restore to new project / follow dashboard flow |

**Stop rule:** if PITR/archive had been off, DDL would not proceed. Verified on.

---

## 1. SQL applied (exact scope)

| Step | Name | Contents |
|------|------|----------|
| 1 | `window_a_system_logs` | `system_logs` table + `idx_system_logs_created` + `ENABLE ROW LEVEL SECURITY` + `REVOKE ALL` from anon/authenticated + `GRANT ALL` to service_role. **Not** the ticket indexes from full `033`. |
| 2 | `112_…` | Exact file: `projects.deleted_at` + partial index + comment |
| 3 | `111_…` | Exact file: partial UNIQUE on `clients.whatsapp_phone_number_id` + `REVOKE INSERT,UPDATE,DELETE` from **authenticated** on listed tables (skip missing `nfc_tags` / `worker_attendance_shifts`) |
| 4 | `121_…` | Exact file: `REVOKE` authenticated+anon on `worker_nfc_tags`, `worker_attendance` |

---

## 2. Prechecks (immediate before apply)

| Check | Result |
|-------|--------|
| WA duplicate groups (non-empty trimmed) | **0** |
| WA empty-after-trim | **0** |
| WA whitespace-padded ≠ trim | **0** |
| `system_logs` / `deleted_at` / WA uidx | all absent before apply |

---

## 3. Sandbox Lab test users (before REVOKE)

| Item | Value |
|------|-------|
| Client | `BINO Sandbox` / `a1111111-1111-4111-8111-111111111111` |
| Project | `SANDBOX01` |
| Manager | `bino-wa-manager@bino.casa` (role `manager`) |
| Viewer | `bino-wa-viewer@bino.casa` (role `viewer`) |
| Pre-REVOKE PostgREST INSERT tickets | **201** (write privilege existed) |
| Pre-REVOKE `/api/create-ticket` | **200** created |
| Cross-org Bamakor project read as sandbox JWT | **[]** (RLS) |

---

## 4. Post-step verification

### After system_logs
- Table exists, RLS on, **0** policies, anon/auth INSERT/SELECT **false**, service INSERT **true**
- Probe insert OK

### After 112
- `projects.deleted_at` exists; index `idx_projects_deleted_at`; active projects count readable

### After 111 + 121 — privilege matrix (`has_table_privilege`)

| Table | auth INS/UPD/DEL | anon INS/UPD/DEL |
|-------|------------------|------------------|
| tickets, projects, workers, residents, sessions, maintenance_tasks, collection_charges, worker_attendance_events | **false** | **true** (residual — RLS still applies) |
| worker_nfc_tags, worker_attendance | **false** | **false** |

**Residual risk (not in approved SQL):** anon still has table GRANTs on 111 core tables. Mitigated by RLS for typical paths; recommend a **future** focused REVOKE anon (separate approval).

### JWT PostgREST (manager) after REVOKE
All probed writes → **403 permission denied for table …** (tickets INSERT/UPDATE/DELETE, projects, workers, residents, collection_charges, maintenance_tasks, sessions, worker_attendance_events, worker_nfc_tags).

Viewer ticket INSERT → **403 permission denied**.

Anon tickets INSERT → blocked by **RLS** (401). Anon `worker_nfc_tags` → **401 permission denied**.

### Authorized API after REVOKE
`POST /api/create-ticket` (public report path / service role) → **200** (ticket numbers 3, 4 on sandbox).

### Cross-org / soft-delete
- Bamakor projects via sandbox JWT → `[]`
- `projects?deleted_at=is.null` → sandbox project visible

### Health / system_logs continuity
- Table writable; **3** rows present (apply probe + 2 health-style probes)
- `/api/cron/health-check` without secret → **401** (expected)
- Next scheduled Vercel cron with `CRON_SECRET` will append via service role

---

## 5. Window B / 113 — not applied; impact check

- Column `idempotency_key` **still missing**
- Collections UI **does not** send `Idempotency-Key` header
- Create charge **without** header does not reference the column → **no current create outage** observed from missing 113
- If a client/retry **sends** `Idempotency-Key`, insert would fail (column missing) — **latent** risk until Window B

---

## 6. D3 sim-tx / audit-tx

Confirmed **sandbox / webhook simulation** test charges (titles/descriptions + historical go-live note B5b). **Not** real provider customer txns. **No** Approve / status change.

---

## 7. Still open for Go buildings

- Proven restore drill (PITR exercise)
- Post-login perf/PWA with test users (beyond login/API smoke)
- Active runtime monitoring (Vercel team re-auth for error API)
- Residual anon GRANTs on 111 tables (optional harden)
- Window B / 113
- This apply ≠ Go בניינים approval
