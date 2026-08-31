-- Grow platform payments: Bamakor holds apiKey+pageCode in env;
-- each tenant has their own Grow userId. Money settles in that account.

alter table public.clients
  add column if not exists grow_enabled boolean not null default false,
  add column if not exists grow_user_id text;

comment on column public.clients.grow_enabled is 'Tenant opted in to Grow collections (requires grow_user_id).';
comment on column public.clients.grow_user_id is 'Grow userid for this merchant — unique per Bamakor client.';

create unique index if not exists clients_grow_user_id_unique
  on public.clients (trim(grow_user_id))
  where grow_user_id is not null and length(trim(grow_user_id)) > 0;

alter table public.collection_charges
  add column if not exists grow_payment_url text,
  add column if not exists grow_payment_link_id text,
  add column if not exists grow_transaction_id text;

comment on column public.collection_charges.grow_payment_url is 'Grow payment-request URL for the resident.';
comment on column public.collection_charges.grow_payment_link_id is 'Grow paymentLinkProcessId.';
comment on column public.collection_charges.grow_transaction_id is 'Grow transactionId after paid webhook.';

create index if not exists collection_charges_grow_payment_link_id_idx
  on public.collection_charges (grow_payment_link_id)
  where grow_payment_link_id is not null;
