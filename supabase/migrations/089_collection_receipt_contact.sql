-- Receipt contact collected on public /pay page (email preferred over SMS).

ALTER TABLE public.collection_charges
  ADD COLUMN IF NOT EXISTS receipt_email text,
  ADD COLUMN IF NOT EXISTS receipt_phone text,
  ADD COLUMN IF NOT EXISTS receipt_email_sent_at timestamptz;

COMMENT ON COLUMN public.collection_charges.receipt_email IS
  'Email entered on /pay for payment receipt (Resend) — preferred over SMS to avoid 019 cost';
COMMENT ON COLUMN public.collection_charges.receipt_phone IS
  'Optional phone entered on /pay; stored for records (receipt sent by email, not SMS)';
COMMENT ON COLUMN public.collection_charges.receipt_email_sent_at IS
  'When Bamakor sent the payment confirmation email via Resend';
