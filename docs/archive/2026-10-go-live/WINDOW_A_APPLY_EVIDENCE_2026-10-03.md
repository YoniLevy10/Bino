# Window A apply evidence — 2026-10-03

**Project:** Bamakor `jsliqlmjksintyigkulq` · **Org plan:** Pro (`tier_pro`) — **PITR not proven**  
**Status:** Window A **applied** · Window B / 113 **not** applied  
**Tip migrations:** `window_a_system_logs`, `112_audit_projects_soft_delete`, `111_audit_whatsapp_phone_unique_and_rls_writes`, `121_revoke_worker_nfc_attendance_writes`

---

## 0. Backup gate (before DDL) — **CORRECTED 2026-10-03 evening**

| Check | Evidence |
|-------|----------|
| Org plan | Levy Tech1 / **Pro** (`tier_pro`) — daily backups **entitled per docs** (7 days); **PITR is a paid add-on and was NOT verified as enabled** |
| WAL archive | `archive_mode=on`, `archive_command=/usr/bin/admin-mgr wal-push %p …` (wal-g) — infrastructure only; **≠ PITR entitlement** |
| Management API backups list | **401** without access token — actual backup objects / restore window **not listed** |
| Canonical correction | See [`BACKUP_TRUTH_2026-10-03.md`](./BACKUP_TRUTH_2026-10-03.md) |

**Stop rule used at apply time relied on Pro + archive_mode.** That is **insufficient** as proof of restore capability. Owner must confirm Dashboard → Database → Backups (daily list and/or PITR window) before treating DR as closed.

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

**Residual risk (not optional without rationale):** anon still has INSERT/UPDATE/DELETE on 111 core tables. RLS mitigates today, but privilege surface remains. Focused REVOKE proposal: `docs/sql-proposals/122_revoke_anon_core_table_writes.sql` — **awaiting owner approval; not applied**.

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
- Residual anon GRANTs on 111 tables (proposal ready — not optional without rationale; awaiting apply approval)
- Window B / 113
- This apply ≠ Go בניינים approval
