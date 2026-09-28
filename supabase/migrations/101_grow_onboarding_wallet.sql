-- Grow onboarding (GetLink) tracking + wallet/approve/invoice fields on charges.

alter table public.clients
  add column if not exists grow_encrypted_lead text,
  add column if not exists grow_onboarding_url text,
  add column if not exists grow_onboarding_status text,
  add column if not exists grow_onboarding_phone text,
  add column if not exists grow_business_number text,
  add column if not exists grow_onboarding_started_at timestamptz,
  add column if not exists grow_onboarding_completed_at timestamptz,
  add column if not exists grow_package_name text;

comment on column public.clients.grow_encrypted_lead is
  'Grow GetLink encrypted_lead / tracking_code — bind registration webhook to this client.';
comment on column public.clients.grow_onboarding_status is
  'pending | approved | rejected | existing | error — Grow merchant registration state.';

create unique index if not exists clients_grow_encrypted_lead_unique
  on public.clients (trim(grow_encrypted_lead))
  where grow_encrypted_lead is not null and length(trim(grow_encrypted_lead)) > 0;

alter table public.collection_charges
  add column if not exists grow_process_id text,
  add column if not exists grow_process_token text,
  add column if not exists grow_approve_status text,
  add column if not exists grow_approve_last_error text,
  add column if not exists grow_approve_at timestamptz,
  add column if not exists grow_invoice_id text,
  add column if not exists grow_invoice_url text,
  add column if not exists grow_invoice_received_at timestamptz;

comment on column public.collection_charges.grow_process_id is
  'Grow createPaymentProcess processId (wallet flow).';
comment on column public.collection_charges.grow_approve_status is
  'ok | failed | pending — ApproveTransaction acknowledgment state.';
comment on column public.collection_charges.grow_invoice_id is
  'Grow invoice id from invoiceNotifyUrl webhook when present.';

create index if not exists collection_charges_grow_process_id_idx
  on public.collection_charges (grow_process_id)
  where grow_process_id is not null;
