-- Wave 3: indexes proven/likely hot from manager path evidence
-- (ticket detail attachments, residents name sort, closed history, open tickets list)

CREATE INDEX IF NOT EXISTS idx_ticket_attachments_ticket_id
  ON public.ticket_attachments (ticket_id);

CREATE INDEX IF NOT EXISTS idx_residents_client_full_name_id
  ON public.residents (client_id, full_name, id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_client_closed_at
  ON public.tickets (client_id, closed_at DESC)
  WHERE deleted_at IS NULL AND status = 'CLOSED';

CREATE INDEX IF NOT EXISTS idx_tickets_client_open_created
  ON public.tickets (client_id, created_at DESC)
  WHERE deleted_at IS NULL AND status IS DISTINCT FROM 'CLOSED';
