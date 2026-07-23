-- WhatsApp video attachments can be up to 16 MB; ensure bucket limit allows them.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('ticket-attachments', 'ticket-attachments', false, 16777216)
ON CONFLICT (id) DO UPDATE SET file_size_limit = GREATEST(
  COALESCE(storage.buckets.file_size_limit, 0),
  16777216
);
