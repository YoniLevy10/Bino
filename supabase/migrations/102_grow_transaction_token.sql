-- Persist Grow transactionToken for ApproveTransaction retry after webhook.

alter table public.collection_charges
  add column if not exists grow_transaction_token text;

comment on column public.collection_charges.grow_transaction_token is
  'Grow transactionToken from S2S callback — required to retry ApproveTransaction.';
