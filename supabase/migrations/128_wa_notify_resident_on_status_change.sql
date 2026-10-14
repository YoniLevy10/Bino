-- P2: opt-in WhatsApp to resident when ticket status moves to IN_PROGRESS / WAITING_PARTS.
-- Default OFF. Read/write only via service-role settings APIs (no authenticated column GRANT —
-- avoids clients GRANT footguns; browser never selects this via PostgREST).

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS wa_notify_resident_on_status_change BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.clients.wa_notify_resident_on_status_change IS
  'When true, send one WhatsApp to reporter on status change to IN_PROGRESS or WAITING_PARTS (idempotent per ticket+status). Default false.';
