-- WhatsApp profile display name, offered as a save suggestion.
-- The manager confirms it on the pending-residents card before it becomes a resident name.

ALTER TABLE pending_resident_join_requests
  ADD COLUMN IF NOT EXISTS suggested_name TEXT;

COMMENT ON COLUMN pending_resident_join_requests.suggested_name IS
  'WhatsApp profile display name. Suggestion only; saved as the resident name only after manager approval.';
