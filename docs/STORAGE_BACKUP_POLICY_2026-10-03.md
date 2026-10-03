# Supabase Storage backup policy — BINO / Bamakor (2026-10-03)

**Project:** Bamakor `jsliqlmjksintyigkulq` (org Levy Tech1, Pro)  
**Constraints for this run:** no paid add-ons purchased, no restore onto production, no paid preview/branch DBs, sandbox/prod DB is not an isolated load/restore venue.

Related: [`BACKUP_TRUTH_2026-10-03.md`](./BACKUP_TRUTH_2026-10-03.md), [`RESTORE_DRILL_SANDBOX_2026-10-03.md`](./RESTORE_DRILL_SANDBOX_2026-10-03.md).

---

## 1. Bucket inventory (live Bamakor)

Queried `storage.buckets` / `storage.objects` on 2026-10-03 via Supabase MCP SQL (read-only).

| Bucket | Public | Size limit | MIME allow-list | `versioning_status` | Objects (approx) | DB metadata table |
|--------|--------|------------|-----------------|---------------------|------------------|-------------------|
| `ticket-attachments` | private | 16 MiB | app-enforced (images/video/PDF); bucket MIME null | **DISABLED** | 73 | `ticket_attachments` (+ paths on maintenance/tour rows) |
| `project-documents` | private | 15 MiB | pdf/office/images/zip/text | **DISABLED** | 1 | `project_documents` |
| `client-logos` | **public** | 2 MiB | jpeg/png/webp | **DISABLED** | 4 | `clients.logo_url` (public URL) |

Soft-delete snapshot (DB only): tickets active **130** / soft-deleted **15**; `ticket_attachments` rows **53**; `project_documents` rows **1**. Soft-deleted tickets **retain** Storage objects today.

### How objects are written

| Bucket | Write paths (code) | Path shape | Upsert |
|--------|-------------------|------------|--------|
| `ticket-attachments` | `lib/ticket-attachment-upload.ts`, WhatsApp media (`lib/whatsapp-media.ts`), worker completion (`lib/worker-ticket-complete.ts`), maintenance-task attachments, worker tours/escort | `{ticketId}/{timestamp}-{rand}.{ext}` (tasks use their own prefixes under same bucket) | `upsert: false` |
| `project-documents` | `app/api/projects/documents` (paid addon), `app/api/projects/resident-portal/documents` (portal PDF) | `{clientId}/{projectId}/{timestamp}-{name}` or `…/portal-{timestamp}-…` | `upsert: false` |
| `client-logos` | `app/api/settings/upload-logo`, `app/api/admin/upload-client-logo` | `{clientId}/logo-{timestamp}.{ext}` | `upsert: true` (logo replace) |

Migrations that create/harden buckets: `054` (project-documents), `058` (client-logos), `078` / `086` (ticket-attachments private + size).

### Retention & delete behavior (app)

| Event | DB | Storage objects |
|-------|----|-----------------|
| Ticket soft-delete (`/api/tickets/delete`, project soft-delete cascade) | `tickets.deleted_at` set | **Kept** (no `.remove()`) |
| Project document DELETE (manager / portal APIs) | Row hard-deleted from `project_documents` | **Gated:** purged only if `STORAGE_ALLOW_PURGE=true` (default **off** as of this PR — see §4) |
| Failed upload after Storage write (rollback) | No row | **Removed** (orphan cleanup; always allowed) |
| Logo replace | `clients.logo_url` updated | Old logo path **not** deleted today (orphan public objects possible) |
| Platform retention policy | None in app | No TTL / lifecycle rules configured in code |

---

## 2. What DB backups cover vs not

From [Supabase Database Backups](https://supabase.com/docs/guides/platform/backups):

| Asset | In daily DB backup / PITR? |
|-------|----------------------------|
| Postgres tables (`tickets`, `ticket_attachments`, `project_documents`, `clients`, …) | **Yes** (metadata, paths, URLs) |
| Auth / RLS / migrations history | **Yes** (DB) |
| `storage.objects` / `storage.buckets` **rows** (paths, metadata JSON) | **Yes** (Storage catalog is in Postgres) |
| **Object bytes** in S3 behind Storage API | **No** — restoring an old DB backup does **not** restore deleted file bytes |
| Bucket versioning / noncurrent versions | N/A while `versioning_status=DISABLED` |

**Implication:** a successful DB restore after Storage deletes yields dangling `file_url` / `storage_path` pointers unless objects were versioned or copied elsewhere.

---

## 3. Backup availability truth (API, no PITR purchase)

| Check | Result | Evidence |
|-------|--------|----------|
| Org plan | Pro (`tier_pro`) | MCP `get_organization` |
| WAL | `archive_mode=on`, `wal_level=logical`, `archive_timeout=120` | `pg_settings` |
| `GET /v1/projects/jsliqlmjksintyigkulq/database/backups` | **401** — `SUPABASE_ACCESS_TOKEN` absent in agent | Management API |
| Listed daily backup timestamps | **Not verified** | Needs owner PAT or Dashboard |
| PITR add-on | **Not purchased / not proven** | Docs: paid add-on; not enabled by this run |
| Storage versioning | **DISABLED** on all 3 buckets | `storage.buckets.versioning_status` |
| Storage versioning product status | Private alpha / feature-preview gated in Studio (not treated as GA DR) | Upstream Studio PRs; do not depend on it for Go |

Pro docs entitlement: typically **7 days** of daily DB backups — **entitlement ≠ confirmed object list** until Dashboard/API shows dates. See [`BACKUP_TRUTH_2026-10-03.md`](./BACKUP_TRUTH_2026-10-03.md).

---

## 4. Recommended DR for files (cheap → better)

### Target objectives (files)

| Metric | Recommended target | Notes |
|--------|--------------------|-------|
| **RPO (files)** | ≤ 24 h for ticket media + project docs | Daily external dump of changed prefixes; tighter RPO needs continuous sync (cost) |
| **RTO (files)** | ≤ 4 h to restore critical ticket media for active tenants | Assumes offsite copy exists; empty Storage after DB-only restore is **not** recoverable |
| **RPO (DB)** | Daily backup window (Pro default) unless PITR later approved | PITR is paid — out of scope unless owner buys |

### Recommended controls (priority order)

1. **Keep soft-delete from wiping Storage** (already true for tickets; document deletes now gated — §5).
2. **Owner Dashboard (read-only confirm):** Database → Backups — note daily backup dates. Do **not** restore onto Bamakor.
3. **Optional Storage versioning** when/if Studio exposes it for the project (alpha): enable on `ticket-attachments` + `project-documents` so `.remove()` becomes archive/recoverable. Confirm billing impact in Dashboard before enabling. Not done by agents (prod config + possible storage cost).
4. **Periodic dump to external** (owner-operated, no new paid Supabase service from agents):
   - Weekly (or daily) `supabase storage` / S3-compatible sync of the three buckets → Google Drive / Backblaze / existing cloud bucket the company already pays for.
   - Keep ≥ 30 days of file dumps for Go buildings.
   - Store dump inventory next to DB dump runbooks.
5. **Do not** use sandbox/prod Bamakor or paid preview branches as restore targets for drills. Use local Postgres + a disposable empty Storage project only with explicit approval.

### What code will not do

- Purchase PITR, Small compute, or any Storage add-on.
- Create paid preview branches / duplicate projects for restore tests.
- Enable bucket versioning on production without owner Dashboard confirmation.

---

## 5. Code defense shipped in this PR

| Change | Behavior |
|--------|----------|
| `lib/storage-purge.ts` | Central gate: durable bucket purge for `user_delete` / `admin_purge` requires `STORAGE_ALLOW_PURGE=true`; `upload_rollback` always allowed |
| Project document DELETE APIs | Delete DB row; skip Storage `.remove()` unless purge env is set; response includes `storage_purged` / `storage_purge_skipped` |
| `softDeleteTicketsForClient` | Documented: never touches Storage |

**Default after deploy:** managers can hide/remove document rows; file bytes remain in Storage until an operator sets `STORAGE_ALLOW_PURGE=true` (Vercel) intentionally (e.g. after external backup exists).

Upload-failure rollbacks still delete the incomplete object so buckets do not fill with failed uploads.

---

## 6. Exact owner actions (Dashboard / env)

### A. Confirm DB backup list (≈2 minutes, free)

1. Open https://supabase.com/dashboard/project/jsliqlmjksintyigkulq/database/backups  
2. Record: daily backup dates **or** PITR earliest/latest (if ever enabled).  
3. Optional PAT:  
   `curl -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" "https://api.supabase.com/v1/projects/jsliqlmjksintyigkulq/database/backups"`  
4. Paste result into a private note / update `BACKUP_TRUTH_*.md`. **Do not restore.**

### B. Storage settings (only if accepting storage cost / alpha UX)

1. Dashboard → Storage → each bucket → check versioning / lifecycle when UI is available.  
2. If enabling versioning: start with `ticket-attachments`, then `project-documents`; leave `client-logos` optional (re-uploadable branding).  
3. Do **not** buy PITR solely for Storage — PITR does not restore object bytes.

### C. External file dump (recommended before treating Storage as durable)

1. Choose an existing offsite bucket/drive (no new paid Supabase product required).  
2. Script a scheduled copy of prefixes under the three buckets (service role, server-side only).  
3. After first successful dump, optionally set Vercel env `STORAGE_ALLOW_PURGE=true` if product must hard-delete document bytes on user delete.  
4. Until then, leave `STORAGE_ALLOW_PURGE` unset (safe default).

### D. Explicitly out of scope without written approval

- Restore any backup onto Bamakor production.  
- Purchase PITR / compute add-ons.  
- Create Supabase preview branches for Storage DR tests.

---

## 7. Smoke after merge

1. Soft-delete a test ticket → confirm `ticket-attachments/{id}/…` still lists.  
2. Delete a project document with purge env **unset** → API `storage_purge_skipped: true`, object still in Storage, row gone from UI.  
3. Failed upload path still cleans orphan (unit-covered for gate; optional manual).
