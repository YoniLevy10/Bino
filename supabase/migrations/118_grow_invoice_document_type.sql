-- Persist Grow document kind from invoiceNotifyUrl (when Grow sends it).
alter table public.collection_charges
  add column if not exists grow_invoice_document_type text,
  add column if not exists grow_invoice_payload_keys text;

comment on column public.collection_charges.grow_invoice_document_type is
  'Grow document type from invoiceNotifyUrl when present (e.g. invoice / receipt).';
comment on column public.collection_charges.grow_invoice_payload_keys is
  'Comma-separated keys from last invoiceNotifyUrl payload (forensics).';
