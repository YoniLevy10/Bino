-- Track BINO email of Grow invoice link to residents (idempotent).
alter table public.collection_charges
  add column if not exists grow_invoice_email_sent_at timestamptz;

comment on column public.collection_charges.grow_invoice_email_sent_at is
  'When BINO emailed the Grow invoice URL to the resident (Resend).';
