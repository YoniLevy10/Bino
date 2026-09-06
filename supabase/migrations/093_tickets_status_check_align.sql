-- Align tickets.status CHECK with app TICKET_STATUSES (lib/ticket-status.ts).
-- Keep legacy values so existing rows (WAITING, DONE, REOPENED) remain valid.

ALTER TABLE public.tickets
  DROP CONSTRAINT IF EXISTS tickets_status_check;

ALTER TABLE public.tickets
  ADD CONSTRAINT tickets_status_check
  CHECK (
    status = ANY (
      ARRAY[
        'NEW'::text,
        'ASSIGNED'::text,
        'IN_PROGRESS'::text,
        'WAITING_PARTS'::text,
        'SITE_TOUR'::text,
        'PROFESSIONAL_ESCORT'::text,
        'CLOSED'::text,
        -- legacy (pre–workflow rename)
        'WAITING'::text,
        'DONE'::text,
        'REOPENED'::text
      ]
    )
  );
