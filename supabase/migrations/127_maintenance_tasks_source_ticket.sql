-- P1: link maintenance tasks to the ticket they were created from (hub flow).
-- RLS/policies from 105 already cover the table for authenticated + service_role;
-- additive column inherits the same tenant policies (no clients column GRANT change).

ALTER TABLE public.maintenance_tasks
  ADD COLUMN IF NOT EXISTS source_ticket_id UUID REFERENCES public.tickets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_maintenance_tasks_source_ticket
  ON public.maintenance_tasks (client_id, source_ticket_id)
  WHERE source_ticket_id IS NOT NULL AND deleted_at IS NULL;

COMMENT ON COLUMN public.maintenance_tasks.source_ticket_id IS
  'Optional ticket this maintenance task was created from (manager TicketDetailDrawer hub).';
