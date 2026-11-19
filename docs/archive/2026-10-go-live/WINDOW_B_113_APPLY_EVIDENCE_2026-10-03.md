# Window B — migration 113 apply evidence (2026-10-03)

**Authorized** in owner execution message. Applied via Supabase `apply_migration` on Bamakor `jsliqlmjksintyigkulq`.

## DDL

- `collection_charges.idempotency_key text`
- UNIQUE partial index `idx_collection_charges_client_idempotency` on `(client_id, idempotency_key) WHERE idempotency_key IS NOT NULL`

## Prechecks

- Column absent before apply; present after.
- No pre-existing non-null keys to conflict.

## UNIQUE / concurrency proof (sandbox only)

1. INSERT draft charge for Sandbox client with key `sandbox-idem-key-2026-10-03-v1` → id `14bc7b52-c4cb-47f3-8cca-a7a12e8e1101`.
2. Second INSERT same `(client_id, idempotency_key)` → **ERROR 23505** unique_violation on `idx_collection_charges_client_idempotency`.
3. App path (`POST /api/collections/charges`): on 23505 + key, selects existing and returns `{ idempotent_replay: true }` (code already present).

No real Grow charges / Approve / status changes performed.

## Partial failure / retry

- Retry with same key after success → lookup-before-insert returns existing (`idempotent_replay: true`) without second insert.
- Concurrent race → UNIQUE catches loser; handler maps to replay.

## Unit

`tests/collection-charge-idempotency.test.ts`

## Live API concurrency (Sandbox, 2026-10-03)

Enabled `collections` addon on Sandbox lab only. Created resident `1a5c9c86-…`.

4 parallel `POST /api/collections/charges` with identical `Idempotency-Key: sandbox-api-idem-1791058087` and `send:false`:

- All returned **200** with the **same** charge id `6077ad97-dea9-42b2-ad75-acaae7b19637`
- DB count for that key: **1** draft row (amount 12.50)

No Grow link / Approve / paid status involved.
