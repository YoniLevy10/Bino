-- Pending ticket description awaiting confirm/cancel button reply
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS pending_ticket_description TEXT;

COMMENT ON COLUMN sessions.pending_ticket_description IS 'Stashed ticket description until resident taps פתח תקלה / ביטול';
